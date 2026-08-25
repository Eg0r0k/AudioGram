import { db } from "@/db";
import {
  TrackState,
  TrackSource,
  type AlbumEntity,
  type ArtistEntity,
  type PinnedFlag,
  type TrackEntity,
} from "@/db/entities";
import { AlbumId, ArtistId } from "@/types/ids";
import { parseTrackRef } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/types/source-dto";
import { BaseMetadata } from "@/workers/types";

//
// ── Remote pin cascade ────────────────────────────────────────────────────────
//
// TrackEntity.albumId/artistIds are mandatory FKs, so pinning a remote track
// upserts shadow album/artist rows with the same deterministic prefixed ids
// ("nd:<albumId>" / "nd:<artistId>"). Pure derivation lives here; the write
// itself goes through unitOfWork in ensurePinned.
//

export interface RemotePinExisting {
  track?: TrackEntity;
  album?: AlbumEntity;
  artists: ReadonlyMap<ArtistId, ArtistEntity>;
}

export interface RemotePinRows {
  track: TrackEntity;
  album: AlbumEntity | null;
  artists: ArtistEntity[];
}

/** A shadow row never downgrades an existing full library member. */
function mergePinned(existing: PinnedFlag | undefined, requested: PinnedFlag): PinnedFlag {
  return existing === 1 ? 1 : requested;
}

function trackSourceOf(dto: SourceTrackDTO): TrackSource {
  const ref = parseTrackRef(dto.id);
  switch (ref.kind) {
    case "nd": return TrackSource.REMOTE_SUBSONIC;
    case "yt": return TrackSource.REMOTE_YT;
    case "local": throw new Error(`Not a remote track id: ${dto.id}`);
  }
}

/**
 * Splits a joined artist string into names. `,` and `;` are the usual tag
 * separators; `&` counts too because YT Music files a collab channel as ONE
 * entity named "A & B", and the library wants A and B. Blank parts and
 * duplicates are dropped; order is kept.
 */
export function splitArtistNames(value: string | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[,;&]/)) {
    const name = part.replace(/\s+/g, " ").trim();
    const key = identityKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * Best-effort per-artist names: the DTO only carries a joined display string,
 * so split it when the parts line up with the id list; otherwise the first
 * row gets the display name. `alignArtists` makes them line up before the
 * cascade runs; this fallback covers DTOs that skipped it.
 */
function artistNamesFor(dto: SourceTrackDTO, ids: ArtistId[]): (string | undefined)[] {
  const parts = splitArtistNames(dto.artistName);
  if (parts.length === ids.length) return parts;
  return ids.map((_, index) => (index === 0 ? dto.artistName : undefined));
}

/**
 * Builds the merged track + shadow album/artist rows for pinning a remote
 * DTO. Snapshot fields come from the DTO (revalidate-on-view semantics);
 * user state on existing rows (likes, counts, tags, addedAt) is preserved.
 */
export function buildRemoteShadowEntities(
  dto: SourceTrackDTO,
  requestedPinned: PinnedFlag,
  existing: RemotePinExisting,
  now: number,
): RemotePinRows {
  const source = trackSourceOf(dto);
  const albumId = dto.albumId ?? existing.track?.albumId ?? AlbumId("");

  const candidateIds = dto.artistIds ?? existing.track?.artistIds ?? [];
  const names = artistNamesFor(dto, candidateIds);
  const artists: ArtistEntity[] = [];
  for (const [index, id] of candidateIds.entries()) {
    const current = existing.artists.get(id);
    const name = current?.name || names[index];
    // No name from any source: an empty artist row renders as a blank entry
    // in the library and never heals — dropping the id is the lesser evil.
    if (!name) continue;
    artists.push({
      ...current,
      id,
      name,
      pinned: mergePinned(current?.pinned, requestedPinned),
      addedAt: current?.addedAt ?? now,
      updatedAt: now,
    });
  }
  const artistIds = artists.map(artist => artist.id);

  const track: TrackEntity = {
    ...existing.track,
    id: dto.id,
    title: dto.title,
    artistName: dto.artistName ?? existing.track?.artistName,
    albumTitle: dto.albumTitle ?? existing.track?.albumTitle,
    artistIds,
    albumId,
    tagIds: existing.track?.tagIds ?? [],
    source,
    pinned: mergePinned(existing.track?.pinned, requestedPinned),
    state: existing.track?.state ?? TrackState.READY,
    duration: dto.duration ?? existing.track?.duration ?? 0,
    format: dto.format ?? existing.track?.format ?? {},
    trackNo: dto.trackNo ?? existing.track?.trackNo,
    diskNo: dto.discNo ?? existing.track?.diskNo,
    playCount: existing.track?.playCount ?? 0,
    addedAt: existing.track?.addedAt ?? now,
  };

  const album: AlbumEntity | null = dto.albumId
    ? {
        ...existing.album,
        id: dto.albumId,
        title: dto.albumTitle ?? existing.album?.title ?? "",
        artistId: existing.album?.artistId ?? artistIds[0] ?? ArtistId(""),
        pinned: mergePinned(existing.album?.pinned, requestedPinned),
        addedAt: existing.album?.addedAt ?? now,
        updatedAt: now,
      }
    : null;

  return { track, album, artists };
}

/**
 * Remote pin cascade, artist identity. The DTO carries a joined display
 * string and, when the source knows them, artist ids — and the two need not
 * agree: a video row knows one channel name, YT Music files a collab as one
 * "A & B" entity, a provider may have no id for a credited artist at all.
 * Every name from `splitArtistNames` resolves to exactly one id, in order:
 *
 * 1. a same-named LOCAL artist — a YT/ND download never duplicates one the
 *    library already has (matching is the import pipeline's identity);
 * 2. the source's own id, when the ids line up one-to-one with the names;
 * 3. a same-named shadow row of the same source (never another source's);
 * 4. a fresh local row.
 *
 * The result has one id per name and the display string re-joined with
 * ", ", so the cascade and the row's caption agree on who the artists are.
 */
export function alignArtists(
  dto: SourceTrackDTO,
  allArtists: readonly ArtistEntity[],
): SourceTrackDTO {
  const names = splitArtistNames(dto.artistName);
  if (names.length === 0) return dto;

  const remoteIds = dto.artistIds ?? [];
  const paired = remoteIds.length === names.length;
  const ownPrefix = `${parseTrackRef(dto.id).kind}:`;

  const locals = new Map<string, ArtistId>();
  const ownShadows = new Map<string, ArtistId>();
  for (const artist of allArtists) {
    let bucket: Map<string, ArtistId> | null = locals;
    if (/^(?:nd|yt):/.test(artist.id)) {
      bucket = artist.id.startsWith(ownPrefix) ? ownShadows : null;
    }
    if (!bucket) continue;
    const key = identityKey(artist.name);
    if (!bucket.has(key)) bucket.set(key, artist.id);
  }

  const artistIds = names.map((name, index) => {
    const key = identityKey(name);
    return locals.get(key)
      ?? (paired ? remoteIds[index] : undefined)
      ?? ownShadows.get(key)
      ?? ArtistId(crypto.randomUUID());
  });

  return { ...dto, artistIds, artistName: names.join(", ") };
}

type AlbumCacheKey = `${ArtistId}::${string}`;

// Identity is whitespace-, case- AND unicode-form-insensitive: tags routinely
// carry stray padding, inconsistent casing ("СЕРЕГА ПИРАТ" vs "Серега Пират"),
// doubled/non-breaking spaces and NFD-decomposed accents (macOS), and a key
// that differs on any of these would split one artist/album into several.
// NFKC additionally folds the full-width/half-width forms common in Japanese
// tags. The per-letter folds below cover casings toLowerCase() can't round-
// trip: uppercase tags erase İ/ı, ß→SS and ё→Е distinctions, so both sides
// fold to one representative. Genuine accents (é, è…) stay significant.
// Display keeps the first-seen (or already stored) spelling.
export function identityKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    // İ lowercases to "i" + combining dot above; fold to plain i.
    .replace(/i̇/g, "i")
    // Turkish dotless ı: caps tags lowercase I to i, losing the distinction.
    .replace(/ı/g, "i")
    // Greek final sigma ς == medial σ.
    .replace(/ς/g, "σ")
    // ß uppercases to SS, so caps tags come back as "ss".
    .replace(/ß/g, "ss")
    // Russian tags use ё and е interchangeably.
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function albumKey(artistId: ArtistId, albumTitle: string): AlbumCacheKey {
  return `${artistId}::${identityKey(albumTitle)}`;
}

interface AlbumEntry {
  id: AlbumId;
  isNew: boolean;
}

export class EntityResolver {
  private readonly artists = new Map<string, ArtistId>();
  private readonly albums = new Map<AlbumCacheKey, AlbumEntry>();

  async resolve(metas: BaseMetadata[]): Promise<void> {
    await this.resolveArtists(metas);
    await this.resolveAlbums(metas);
  }

  getArtistId(name: string): ArtistId | undefined {
    return this.artists.get(identityKey(name));
  }

  getAlbumEntry(artistId: ArtistId, albumTitle: string): AlbumEntry | undefined {
    return this.albums.get(albumKey(artistId, albumTitle));
  }

  getArtistIds(meta: BaseMetadata): ArtistId[] {
    return meta.artists
      .filter(name => name?.trim())
      .map(name => this.artists.get(identityKey(name)))
      .filter((id): id is ArtistId => !!id);
  }

  private async resolveArtists(metas: BaseMetadata[]): Promise<void> {
    const uniqueKeys = [
      ...new Set(
        metas.flatMap(m => m.artists).filter(a => a?.trim()).map(identityKey),
      ),
    ];

    if (uniqueKeys.length === 0) return;

    const existing = await db.artists.toArray();
    const wanted = new Set(uniqueKeys);
    for (const artist of existing) {
      const key = identityKey(artist.name);
      if (wanted.has(key) && !this.artists.has(key)) {
        this.artists.set(key, artist.id);
      }
    }

    for (const key of uniqueKeys) {
      if (!this.artists.has(key)) {
        this.artists.set(key, ArtistId(crypto.randomUUID()));
      }
    }
  }

  private async resolveAlbums(metas: BaseMetadata[]): Promise<void> {
    const knownArtistIds = [
      ...new Set(
        metas.flatMap(m => m.artists)
          .map(name => name && this.artists.get(identityKey(name)))
          .filter((id): id is ArtistId => !!id),
      ),
    ];

    if (knownArtistIds.length === 0) return;

    const existing = await db.albums
      .where("artistId")
      .anyOf(knownArtistIds)
      .toArray();

    for (const album of existing) {
      this.albums.set(
        albumKey(album.artistId, album.title),
        { id: album.id, isNew: false },
      );
    }

    for (const meta of metas) {
      const title = meta.album?.trim();
      if (!title || title === "Unknown Album") continue;

      const firstArtistId = meta.artists[0] && this.artists.get(identityKey(meta.artists[0]));
      if (!firstArtistId) continue;

      const key = albumKey(firstArtistId, title);
      if (!this.albums.has(key)) {
        this.albums.set(key, { id: AlbumId(crypto.randomUUID()), isNew: true });
      }
    }
  }
}
