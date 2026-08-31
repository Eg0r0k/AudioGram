import { db } from "@/db";
import { unitOfWork } from "@/db/unit-of-work";
import type { TrackEntity } from "@/db/entities";
import { cleanupAfterTrackRemoval } from "@/services/library-gc";

/**
 * Library rows of a watched folder, addressed the only way they can be: by
 * the `storagePath` prefix. A folder nested inside another watched folder
 * owns its own rows, so the outer folder's operations exclude them —
 * callers pass those paths in from the store.
 */

const under = (folderPath: string) =>
  db.tracks.where("storagePath").startsWith(folderPath + "/");

const outsideNested = (tracks: TrackEntity[], nestedPaths: string[]) =>
  (nestedPaths.length === 0
    ? tracks
    : tracks.filter(track => !nestedPaths.some(nested => track.storagePath?.startsWith(nested + "/"))));

export const getFolderTracks = async (
  folderPath: string,
  nestedPaths: string[] = [],
): Promise<TrackEntity[]> => outsideNested(await under(folderPath).toArray(), nestedPaths);

/** Counts without materialising the rows when there is nothing to exclude. */
export const countFolderTracks = async (
  folderPath: string,
  nestedPaths: string[] = [],
): Promise<number> => {
  if (nestedPaths.length === 0) return under(folderPath).count();
  return (await getFolderTracks(folderPath, nestedPaths)).length;
};

/**
 * Drops the rows in one transaction, cascading onto albums/artists that lose
 * their last reference. Throws on a failed transaction — the caller decides
 * what the user sees.
 */
export const deleteFolderTracks = async (tracks: TrackEntity[]): Promise<void> => {
  if (tracks.length === 0) return;

  const txResult = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists, db.covers],
    async () => {
      await db.tracks.bulkDelete(tracks.map(track => track.id));
      await cleanupAfterTrackRemoval(tracks);
    },
  );
  if (txResult.isErr()) throw txResult.error;
};

/** Rebases every row of a moved folder onto its new location. */
export const relinkFolderTracks = async (oldPath: string, newPath: string): Promise<void> => {
  const tracks = await under(oldPath).toArray();
  if (tracks.length === 0) return;

  await db.tracks.bulkPut(tracks.map(track => ({
    ...track,
    // Rows came off the storagePath index, so the path is always present.
    storagePath: newPath + (track.storagePath ?? "").slice(oldPath.length),
  })));
};
