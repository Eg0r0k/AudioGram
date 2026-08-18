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
 * Best-effort per-artist names: the DTO only carries a joined display string,
 * so split it when the parts line up with the id list; otherwise the first
 * row gets the display name. Revalidate-on-view refreshes them later.
 */
function artistNamesFor(dto: SourceTrackDTO, ids: ArtistId[]): (string | undefined)[] {
  const parts = dto.artistName?.split(/,\s*/) ?? [];
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
  const artistIds = dto.artistIds ?? existing.track?.artistIds ?? [];
  const albumId = dto.albumId ?? existing.track?.albumId ?? AlbumId("");

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

  const names = artistNamesFor(dto, artistIds);
  const artists: ArtistEntity[] = artistIds.map((id, index) => {
    const current = existing.artists.get(id);
    return {
      ...current,
      id,
      name: current?.name || names[index] || "",
      pinned: mergePinned(current?.pinned, requestedPinned),
      addedAt: current?.addedAt ?? now,
      updatedAt: now,
    };
  });

  return { track, album, artists };
}

/**
 * Remote pin cascade, artist identity: a same-named LOCAL artist wins over
 * creating a remote-prefixed shadow row, so downloading a YT/ND album never
 * duplicates an artist the library already has. Matching is the same
 * whitespace/case-insensitive identity the import pipeline uses; only
 * unprefixed (local) rows are candidates — never another source's shadow.
 */
export function substituteLocalArtists(
  dto: SourceTrackDTO,
  allArtists: readonly ArtistEntity[],
): SourceTrackDTO {
  const remoteIds = dto.artistIds ?? [];
  if (remoteIds.length === 0) return dto;

  const locals = new Map<string, ArtistId>();
  for (const artist of allArtists) {
    if (/^(?:nd|yt):/.test(artist.id)) continue;
    const key = identityKey(artist.name);
    if (!locals.has(key)) locals.set(key, artist.id);
  }
  if (locals.size === 0) return dto;

  const names = artistNamesFor(dto, [...remoteIds]);
  const artistIds = remoteIds.map((id, index) => {
    const name = names[index];
    return (name && locals.get(identityKey(name))) || id;
  });

  return { ...dto, artistIds };
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
