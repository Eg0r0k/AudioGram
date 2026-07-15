import { db } from "@/db";
import { AlbumEntity, ArtistEntity, TrackEntity, TrackState } from "@/db/entities";
import { albumRepository, artistRepository, coverRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { AlbumId, ArtistId } from "@/types/ids";
import { unwrapResult } from "@/queries/shared";
import { EntityResolver } from "../entity-resolver";
import { ImportSuccess, TrackToSave } from "../types";

const COVER_MAX_DIMENSION = 500;
const COVER_QUALITY = 0.8;

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
  ownerId: AlbumId;
  blob: Blob;
  mimeType: string;
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
  const coversToCreate: CoverToCreate[] = [];
  const tracksToCreate: TrackEntity[] = [];
  const results: ImportSuccess[] = [];

  const { existingArtistIds, existingAlbumIds } = await loadExistingIds(items, resolver);

  for (const item of items) {
    const artistIds = resolver.getArtistIds(item.meta);

    const albumId = await collectAlbum(
      item, resolver, existingAlbumIds, albumsToCreate, coversToCreate, now,
    );
    collectArtists(item, resolver, existingArtistIds, artistsToCreate, now);

    tracksToCreate.push({
      id: item.trackId,
      title: item.meta.title,
      artistName: item.meta.artists.join(", "),
      albumTitle: item.meta.album || "",
      artistIds,
      albumId,
      tagIds: [],
      source: item.source,
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

  const uowResult = await unitOfWork.runScoped(
    [db.tracks, db.artists, db.albums, db.covers],
    async () => {
      if (artistsToCreate.size > 0) {
        await artistRepository.createMany([...artistsToCreate.values()]);
      }
      if (albumsToCreate.size > 0) {
        await albumRepository.createMany([...albumsToCreate.values()]);
      }
      if (coversToCreate.length > 0) {
        await coverRepository.createMany(
          coversToCreate.map(c => ({
            id: crypto.randomUUID(),
            ownerType: "album" as const,
            ownerId: c.ownerId,
            blob: c.blob,
            mimeType: c.mimeType,
            addedAt: now,
            updatedAt: now,
          })),
        );
      }
      if (tracksToCreate.length > 0) {
        await trackRepository.createMany(tracksToCreate);
      }
    });

  if (uowResult.isErr()) throw uowResult.error;

  return results;
}

/** Fetches which of the batch's artist/album ids already exist in the DB. */
async function loadExistingIds(items: TrackToSave[], resolver: EntityResolver) {
  const allArtistIds = [...new Set(items.flatMap(item => resolver.getArtistIds(item.meta)))];
  const allAlbumIds = [...new Set(
    items.map((item) => {
      const firstId = resolver.getArtistIds(item.meta)[0];
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
async function collectAlbum(
  item: TrackToSave,
  resolver: EntityResolver,
  existingAlbumIds: Set<AlbumId>,
  albumsToCreate: Map<AlbumId, AlbumEntity>,
  coversToCreate: CoverToCreate[],
  now: number,
): Promise<AlbumId> {
  const firstArtistId = resolver.getArtistIds(item.meta)[0] ?? null;
  const hasAlbum = !!item.meta.album?.trim() && item.meta.album !== "Unknown Album";
  if (!hasAlbum || !firstArtistId) return AlbumId("");

  const entry = resolver.getAlbumEntry(firstArtistId, item.meta.album);
  if (!entry) return AlbumId("");

  if (entry.isNew && !existingAlbumIds.has(entry.id) && !albumsToCreate.has(entry.id)) {
    albumsToCreate.set(entry.id, {
      id: entry.id,
      title: item.meta.album,
      artistId: firstArtistId,
      year: item.meta.year,
      addedAt: now,
      updatedAt: now,
    });

    if (item.meta.pictureBlob) {
      const blob = await resizeCoverBlob(item.meta.pictureBlob);
      coversToCreate.push({
        ownerId: entry.id,
        blob,
        mimeType: "image/webp",
      });
    }
  }

  return entry.id;
}

/** Queues any of the track's artists that don't exist yet for creation. */
function collectArtists(
  item: TrackToSave,
  resolver: EntityResolver,
  existingArtistIds: Set<ArtistId>,
  artistsToCreate: Map<ArtistId, ArtistEntity>,
  now: number,
): void {
  for (const artistId of resolver.getArtistIds(item.meta)) {
    if (existingArtistIds.has(artistId) || artistsToCreate.has(artistId)) continue;

    const name = item.meta.artists.find(a => resolver.getArtistId(a) === artistId);
    if (name) {
      artistsToCreate.set(artistId, { id: artistId, name, addedAt: now, updatedAt: now });
    }
  }
}
