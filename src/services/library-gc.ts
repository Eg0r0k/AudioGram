import { db } from "@/db";
import { unitOfWork } from "@/db/unit-of-work";
import { getLogger } from "@/lib/logger";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";

//
// Orphan cleanup for library entities. Albums and artists are created
// implicitly by the import pipeline, so they must also die implicitly:
// tracks → orphaned albums → orphaned artists. An artist goes only when
// neither their tracks nor their albums remain.
//
// Every check below is one index query over the whole candidate set, never
// one query per candidate: the cascade runs inside the caller's write
// transaction, and a whole-library delete hands it thousands of candidates.
//

/** The pieces of a deleted track the cascade needs. */
export interface RemovedTrackRef {
  id: TrackId;
  albumId?: AlbumId | "";
  artistIds?: ArtistId[];
}

type OwnerKey = [string, string];

const coverOwnerKeys = (ownerType: "album" | "track", ids: readonly string[]): OwnerKey[] =>
  ids.map(id => [ownerType, id]);

/** Album ids among `candidates` that still have at least one track. */
const albumsWithTracks = async (candidates: readonly AlbumId[]): Promise<Set<AlbumId>> => {
  if (candidates.length === 0) return new Set();
  return new Set(await db.tracks.where("albumId").anyOf([...candidates]).keys() as AlbumId[]);
};

/** Artist ids among `candidates` still referenced by a track or an album. */
const artistsReferenced = async (candidates: readonly ArtistId[]): Promise<Set<ArtistId>> => {
  if (candidates.length === 0) return new Set();
  const [byTracks, byAlbums] = await Promise.all([
    db.tracks.where("artistIds").anyOf([...candidates]).keys(),
    db.albums.where("artistId").anyOf([...candidates]).keys(),
  ]);
  return new Set([...byTracks, ...byAlbums] as ArtistId[]);
};

const deleteAlbumsWithCovers = async (ids: readonly AlbumId[]): Promise<void> => {
  if (ids.length === 0) return;
  await db.albums.bulkDelete([...ids]);
  await db.covers.where("[ownerType+ownerId]").anyOf(coverOwnerKeys("album", ids)).delete();
};

/**
 * Cascade for freshly deleted tracks: drops their albums that lost the last
 * track, then their artists that lost both tracks and albums. Call AFTER the
 * track rows are gone.
 */
export async function cleanupAfterTrackRemoval(removed: RemovedTrackRef[]): Promise<void> {
  if (removed.length === 0) return;

  // Track-owned covers (album-less imports) die with their track.
  await db.covers.where("[ownerType+ownerId]")
    .anyOf(coverOwnerKeys("track", removed.map(track => track.id)))
    .delete();

  const candidateAlbums = [...new Set(
    removed.map(track => track.albumId).filter((id): id is AlbumId => !!id),
  )];
  const candidateArtists = new Set(
    removed.flatMap(track => track.artistIds ?? []).filter((id): id is ArtistId => !!id),
  );

  const survivingAlbums = await albumsWithTracks(candidateAlbums);
  const orphanAlbums = candidateAlbums.filter(id => !survivingAlbums.has(id));

  // A deleted album can orphan its artist even when the track didn't list them.
  for (const album of await db.albums.bulkGet(orphanAlbums)) {
    if (album) candidateArtists.add(album.artistId);
  }
  await deleteAlbumsWithCovers(orphanAlbums);

  const referencedArtists = await artistsReferenced([...candidateArtists]);
  const orphanArtists = [...candidateArtists].filter(id => !referencedArtists.has(id));
  if (orphanArtists.length > 0) {
    await db.artists.bulkDelete(orphanArtists);
  }
}

/**
 * Full-library sweep of the same cascade — clears orphans accumulated before
 * the cascade existed. Note it also removes intentionally empty albums or
 * artists a user created by hand and never filled.
 */
export async function sweepOrphanedEntities(): Promise<{ albums: number; artists: number }> {
  // One transaction: the sweep runs at startup concurrently with the
  // download-manager init and queue restore.
  const result = await unitOfWork.run(async () => {
    const referencedAlbums = new Set(await db.tracks.orderBy("albumId").uniqueKeys() as AlbumId[]);
    const orphanAlbums = (await db.albums.toCollection().primaryKeys()).filter(id => !referencedAlbums.has(id));
    await deleteAlbumsWithCovers(orphanAlbums);

    const [artistsByTracks, artistsByAlbums] = await Promise.all([
      db.tracks.orderBy("artistIds").uniqueKeys(),
      db.albums.orderBy("artistId").uniqueKeys(),
    ]);
    const referencedArtists = new Set([...artistsByTracks, ...artistsByAlbums] as ArtistId[]);
    const orphanArtists = (await db.artists.toCollection().primaryKeys()).filter(id => !referencedArtists.has(id));
    if (orphanArtists.length > 0) {
      await db.artists.bulkDelete(orphanArtists);
    }

    // Track-owned covers have no implicit-entity cascade of their own, so any
    // deletion path that skips cleanupAfterTrackRemoval self-heals here.
    const trackIds = new Set<string>(await db.tracks.toCollection().primaryKeys());
    const trackCovers = await db.covers.where("ownerType").equals("track").toArray();
    const orphanCoverIds = trackCovers.filter(cover => !trackIds.has(cover.ownerId)).map(cover => cover.id);
    if (orphanCoverIds.length > 0) {
      await db.covers.bulkDelete(orphanCoverIds);
    }

    return { albums: orphanAlbums.length, artists: orphanArtists.length };
  });
  if (result.isErr()) throw result.error;

  if (result.value.albums > 0 || result.value.artists > 0) {
    getLogger().info(
      `[LibraryGC] Swept ${result.value.albums} orphan albums, ${result.value.artists} orphan artists`,
    );
  }
  return result.value;
}
