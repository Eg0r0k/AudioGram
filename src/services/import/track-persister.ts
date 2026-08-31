import pLimit from "p-limit";
import { db } from "@/db";
import type { AlbumEntity, ArtistEntity, CoverOwnerType, TrackEntity } from "@/db/entities";
import { TrackState } from "@/db/entities";
import { albumRepository, artistRepository, coverRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import type { ArtistId } from "@/types/ids";
import { AlbumId } from "@/types/ids";
import { unwrapResult } from "@/lib/result";
import type { EntityResolver } from "../entity-resolver";
import type { ImportSuccess, TrackToSave } from "../types";

const COVER_MAX_DIMENSION = 500;
const COVER_QUALITY = 0.8;
/** Concurrent cover decodes; each one holds a full-resolution bitmap. */
const coverLimit = pLimit(4);

// Compressing large covers to optimize memory in the local databaseы
const resizeCoverBlob = async (blob: Blob): Promise<Blob> => {
  if (blob.size < 50_000) return blob;

  const img = await createImageBitmap(blob);

  if (img.width <= COVER_MAX_DIMENSION && img.height <= COVER_MAX_DIMENSION) {
    img.close();
    return blob;
  }

  const ratio = Math.min(COVER_MAX_DIMENSION / img.width, COVER_MAX_DIMENSION / img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    img.close();
    return blob;
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close();

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      resized => resolve(resized ?? blob),
      "image/webp",
      COVER_QUALITY,
    );
  });
};

interface CoverToCreate {
  ownerType: CoverOwnerType;
  ownerId: string;
  blob: Blob;
  mimeType: string;
}

/** A cover queued for resizing once the batch has been walked. */
interface PendingCover {
  ownerType: CoverOwnerType;
  ownerId: string;
  source: Blob;
}

/**
 * Caches the resolved artist ids per item for the lifetime of one batch.
 * Keyed by the item so two tracks sharing a metadata object still agree.
 */
function memoizeArtistIds(resolver: EntityResolver) {
  const cache = new Map<TrackToSave, ArtistId[]>();
  return (item: TrackToSave): ArtistId[] => {
    let ids = cache.get(item);
    if (!ids) {
      ids = resolver.getArtistIds(item.meta);
      cache.set(item, ids);
    }
    return ids;
  };
}

/**
 * Persists a batch of parsed tracks together with any artists, albums and
 * covers they introduce, inside a single unit-of-work transaction.
 *
 * @param resolver Must already be resolved against the batch metadata.
 * @throws The unit-of-work error when the transaction fails.
 */
export async function persistTracks(
  items: TrackToSave[],
  resolver: EntityResolver,
): Promise<ImportSuccess[]> {
  const now = Date.now();

  const artistsToCreate = new Map<ArtistId, ArtistEntity>();
  const albumsToCreate = new Map<AlbumId, AlbumEntity>();
  const pendingCovers: PendingCover[] = [];
  const tracksToCreate: TrackEntity[] = [];
  const results: ImportSuccess[] = [];

  // Resolving artist ids walks and filters the metadata; each item needs them
  // three times below, so resolve once per batch.
  const artistIdsOf = memoizeArtistIds(resolver);

  const { existingArtistIds, existingAlbumIds } = await loadExistingIds(items, artistIdsOf, resolver);

  for (const item of items) {
    const artistIds = artistIdsOf(item);

    const albumId = collectAlbum(
      item, resolver, artistIds, existingAlbumIds, albumsToCreate, pendingCovers, now,
    );
    collectArtists(item, resolver, artistIds, existingArtistIds, artistsToCreate, now);

    if (!albumId && item.meta.pictureBlob) {
      pendingCovers.push({ ownerType: "track", ownerId: item.trackId, source: item.meta.pictureBlob });
    }

    tracksToCreate.push({
      id: item.trackId,
      title: item.meta.title,
      artistName: item.meta.artists.join(", "),
      albumTitle: item.meta.album.trim() || "",
      artistIds,
      albumId,
      tagIds: [],
      source: item.source,
      pinned: 1,
      state: TrackState.READY,
      storagePath: item.storagePath,
      duration: item.meta.duration,
      format: item.meta.format,
      trackNo: item.meta.trackNo,
      diskNo: item.meta.diskNo,
      playCount: 0,
      addedAt: now,
      fingerprint: item.fingerprint,
      integratedLufs: item.meta.integratedLufs,
      truePeakDbtp: item.meta.truePeakDbtp,
      replayGainDb: item.meta.replayGainDb,
      replayPeak: item.meta.replayPeak,
    });

    results.push({
      trackId: item.trackId,
      fileName: item.fileName,
      title: item.meta.title,
      artist: item.meta.artists.join(", "),
      album: item.meta.album,
    });
  }

  // Decoding and re-encoding covers is the slowest part of a batch, so run
  // several at once — but capped, since each decode holds a full-size bitmap.
  const coversToCreate: CoverToCreate[] = await Promise.all(
    pendingCovers.map(({ ownerType, ownerId, source }) =>
      coverLimit(async () => {
        const blob = await resizeCoverBlob(source);
        return { ownerType, ownerId, blob, mimeType: blob.type || source.type };
      }),
    ),
  );

  const uowResult = await unitOfWork.runScoped(
    [db.tracks, db.artists, db.albums, db.covers],
    async () => {
      if (artistsToCreate.size > 0) {
        await unwrapResult(artistRepository.createMany([...artistsToCreate.values()]));
      }
      if (albumsToCreate.size > 0) {
        await unwrapResult(albumRepository.createMany([...albumsToCreate.values()]));
      }
      if (coversToCreate.length > 0) {
        await unwrapResult(coverRepository.createMany(
          coversToCreate.map(c => ({
            id: crypto.randomUUID(),
            ownerType: c.ownerType,
            ownerId: c.ownerId,
            blob: c.blob,
            mimeType: c.mimeType,
            addedAt: now,
            updatedAt: now,
          })),
        ));
      }
      if (tracksToCreate.length > 0) {
        await unwrapResult(trackRepository.createMany(tracksToCreate));
      }
    });

  if (uowResult.isErr()) throw uowResult.error;

  return results;
}

/** Fetches which of the batch's artist/album ids already exist in the DB. */
async function loadExistingIds(
  items: TrackToSave[],
  artistIdsOf: (item: TrackToSave) => ArtistId[],
  resolver: EntityResolver,
) {
  const allArtistIds = [...new Set(items.flatMap(artistIdsOf))];
  const allAlbumIds = [...new Set(
    items.map((item) => {
      const firstId = artistIdsOf(item)[0];
      if (!firstId || !item.meta.album) return null;
      return resolver.getAlbumEntry(firstId, item.meta.album)?.id ?? null;
    }).filter((id): id is AlbumId => id !== null),
  )];

  const [artistResults, albumResults] = await Promise.all([
    allArtistIds.length > 0
      ? unwrapResult(artistRepository.findByIds(allArtistIds))
      : Promise.resolve([] as ArtistEntity[]),
    allAlbumIds.length > 0
      ? unwrapResult(albumRepository.findByIds(allAlbumIds))
      : Promise.resolve([] as AlbumEntity[]),
  ]);

  return {
    existingArtistIds: new Set(artistResults.map(a => a.id)),
    existingAlbumIds: new Set(albumResults.map(a => a.id)),
  };
}

/**
 * Resolves the track's album id and, when the album is new to both the DB and
 * this batch, queues the album (and its cover, if any) for creation.
 */
function collectAlbum(
  item: TrackToSave,
  resolver: EntityResolver,
  artistIds: ArtistId[],
  existingAlbumIds: Set<AlbumId>,
  albumsToCreate: Map<AlbumId, AlbumEntity>,
  pendingCovers: PendingCover[],
  now: number,
): AlbumId {
  const firstArtistId = artistIds[0] ?? null;
  const hasAlbum = !!item.meta.album.trim() && item.meta.album !== "Unknown Album";
  if (!hasAlbum || !firstArtistId) return AlbumId("");

  const entry = resolver.getAlbumEntry(firstArtistId, item.meta.album);
  if (!entry) return AlbumId("");

  if (entry.isNew && !existingAlbumIds.has(entry.id) && !albumsToCreate.has(entry.id)) {
    albumsToCreate.set(entry.id, {
      id: entry.id,
      // Stored trimmed so the next import's key derivation round-trips.
      title: item.meta.album.trim(),
      artistId: firstArtistId,
      year: item.meta.year,
      pinned: 1,
      addedAt: now,
      updatedAt: now,
    });

    if (item.meta.pictureBlob) {
      pendingCovers.push({ ownerType: "album", ownerId: entry.id, source: item.meta.pictureBlob });
    }
  }

  return entry.id;
}

/** Queues any of the track's artists that don't exist yet for creation. */
function collectArtists(
  item: TrackToSave,
  resolver: EntityResolver,
  artistIds: ArtistId[],
  existingArtistIds: Set<ArtistId>,
  artistsToCreate: Map<ArtistId, ArtistEntity>,
  now: number,
): void {
  for (const artistId of artistIds) {
    if (existingArtistIds.has(artistId) || artistsToCreate.has(artistId)) continue;

    const name = item.meta.artists.find(a => a && resolver.getArtistId(a) === artistId);
    if (name) {
      artistsToCreate.set(artistId, { id: artistId, name: name.trim(), pinned: 1, addedAt: now, updatedAt: now });
    }
  }
}
