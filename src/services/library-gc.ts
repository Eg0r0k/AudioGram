import { db } from "@/db";
import { unitOfWork } from "@/db/unit-of-work";
import { getLogger } from "@/lib/logger";
import type { AlbumId, ArtistId } from "@/types/ids";

//
// Orphan cleanup for library entities. Albums and artists are created
// implicitly by the import pipeline, so they must also die implicitly:
// tracks → orphaned albums → orphaned artists. An artist goes only when
// neither their tracks nor their albums remain.
//

/** The pieces of a deleted track the cascade needs. */
export interface RemovedTrackRef {
  albumId?: AlbumId | "";
  artistIds?: ArtistId[];
}

async function albumIsOrphan(albumId: AlbumId): Promise<boolean> {
  return (await db.tracks.where("albumId").equals(albumId).count()) === 0;
}

async function artistIsOrphan(artistId: ArtistId): Promise<boolean> {
  const [trackCount, albumCount] = await Promise.all([
    db.tracks.where("artistIds").equals(artistId).count(),
    db.albums.where("artistId").equals(artistId).count(),
  ]);
  return trackCount === 0 && albumCount === 0;
}

async function deleteAlbums(ids: AlbumId[]): Promise<void> {
  if (ids.length === 0) return;
  await db.albums.bulkDelete(ids);
  for (const id of ids) {
    await db.covers.where("[ownerType+ownerId]").equals(["album", id]).delete();
  }
}

/**
 * Cascade for freshly deleted tracks: drops their albums that lost the last
 * track, then their artists that lost both tracks and albums. Call AFTER the
 * track rows are gone.
 */
export async function cleanupAfterTrackRemoval(removed: RemovedTrackRef[]): Promise<void> {
  const candidateAlbums = [...new Set(
    removed.map(track => track.albumId).filter((id): id is AlbumId => !!id),
  )];
  const candidateArtists = new Set(removed.flatMap(track => track.artistIds ?? []));

  const orphanAlbums: AlbumId[] = [];
  for (const albumId of candidateAlbums) {
    if (await albumIsOrphan(albumId)) orphanAlbums.push(albumId);
  }
  // A deleted album can orphan its artist even when the track didn't list them.
  for (const album of await db.albums.bulkGet(orphanAlbums)) {
    if (album) candidateArtists.add(album.artistId);
  }
  await deleteAlbums(orphanAlbums);

  const orphanArtists: ArtistId[] = [];
  for (const artistId of candidateArtists) {
    if (artistId && await artistIsOrphan(artistId)) orphanArtists.push(artistId);
  }
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
  // One transaction for the whole sweep: it runs at startup concurrently
  // with the download-manager init and queue restore, and must neither see
  // nor leave half-applied cascades.
  const result = await unitOfWork.run(async () => {
    const orphanAlbums: AlbumId[] = [];
    for (const album of await db.albums.toArray()) {
      if (await albumIsOrphan(album.id)) orphanAlbums.push(album.id);
    }
    await deleteAlbums(orphanAlbums);

    const orphanArtists: ArtistId[] = [];
    for (const artist of await db.artists.toArray()) {
      if (await artistIsOrphan(artist.id)) orphanArtists.push(artist.id);
    }
    if (orphanArtists.length > 0) {
      await db.artists.bulkDelete(orphanArtists);
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
