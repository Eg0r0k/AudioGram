import type { OfflineCopyEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { db } from "@/db";
import { offlineCopyRepository, playlistRepository, trackRepository } from "@/db/repositories";
import { cleanupOfflineCopyFiles } from "@/modules/downloads/service/removeCopy";
import { removeSearchDocuments } from "@/modules/search/service/searchIndex";
import { cleanupAfterTrackRemoval } from "@/services/library-gc";
import type { PlaylistId, TrackId } from "@/types/ids";
import type { QueryClient } from "@tanstack/vue-query";
import { queryKeys } from "@/queries/query-keys";
import { removeTracksFromCaches, syncPlaylistCaches, syncPlaylistTrackRemoval } from "./cache";
import { unwrapResult } from "./shared";

//
// Deleting a container (album, artist, playlist) can take its tracks with it.
// The cascade is the same wherever it is triggered from, so it lives here:
// rows die inside the caller's transaction, everything outside the database
// (copy files, query caches, the search index) is synced strictly after the
// commit.
//

/** Transaction scope a track purge needs — pass to `unitOfWork.runScoped`. */
export const trackCascadeTables = () => [
  db.tracks,
  db.albums,
  db.artists,
  db.playlists,
  db.covers,
  db.offlineCopies,
];

/** A playlist that lost track references, plus which ones it lost. */
export interface PlaylistTrackRemoval {
  next: PlaylistEntity;
  removedIds: TrackId[];
}

/** Offline copies of the given tracks — read before the transaction opens. */
export const findOfflineCopiesOf = async (
  trackIds: readonly TrackId[],
): Promise<OfflineCopyEntity[]> =>
  trackIds.length > 0 ? unwrapResult(offlineCopyRepository.findByIds([...trackIds])) : [];

/**
 * Deletes the track rows and everything that points at them. Runs INSIDE an
 * open transaction scoped to `trackCascadeTables()`; the returned playlist
 * removals are the caller's input to `syncAfterTrackPurge`.
 */
export const purgeTracksInTx = async (
  tracks: readonly TrackEntity[],
  copies: readonly OfflineCopyEntity[],
  now: number,
): Promise<PlaylistTrackRemoval[]> => {
  if (tracks.length === 0) return [];

  const trackIds = tracks.map(track => track.id);
  const trackIdSet = new Set(trackIds);

  // Playlists are read inside the tx and written back as partial updates,
  // so a rename racing the delete survives.
  const playlists = await unwrapResult(playlistRepository.findAll());
  const removals = playlists
    .filter(playlist => playlist.trackIds.some(id => trackIdSet.has(id)))
    .map(playlist => ({
      next: {
        ...playlist,
        trackIds: playlist.trackIds.filter(id => !trackIdSet.has(id)),
        updatedAt: now,
      },
      removedIds: playlist.trackIds.filter(id => trackIdSet.has(id)),
    }));

  if (removals.length > 0) {
    await unwrapResult(playlistRepository.updateMany(removals.map(({ next }) => ({
      key: next.id,
      changes: { trackIds: next.trackIds, updatedAt: next.updatedAt },
    }))));
  }
  if (copies.length > 0) {
    await unwrapResult(offlineCopyRepository.deleteMany(copies.map(copy => copy.trackId)));
  }
  await unwrapResult(trackRepository.deleteMany(trackIds));
  // The album dies with its last track, the artist with their last album.
  await cleanupAfterTrackRemoval([...tracks]);

  return removals;
};

/**
 * Post-commit fan-out for a purge: copy files on disk, query caches and the
 * search index. `skipPlaylistIds` drops playlists that were deleted alongside
 * the tracks — re-syncing their caches would resurrect them.
 */
export interface TrackPurgeSyncOptions {
  /** Leave the copy files on disk; the caller deletes them later (undo window). */
  deferCopyFiles?: boolean;
}

export const syncAfterTrackPurge = async (
  queryClient: QueryClient,
  trackIds: readonly TrackId[],
  playlistRemovals: readonly PlaylistTrackRemoval[],
  copies: readonly OfflineCopyEntity[],
  skipPlaylistIds: readonly PlaylistId[] = [],
  options: TrackPurgeSyncOptions = {},
) => {
  if (options.deferCopyFiles) {
    for (const copy of copies) {
      queryClient.setQueryData(queryKeys.offlineCopies.detail(copy.trackId), null);
    }
  }
  else {
    await cleanupOfflineCopyFiles(copies);
  }

  const skipped = new Set(skipPlaylistIds);
  for (const { next, removedIds } of playlistRemovals) {
    if (skipped.has(next.id)) continue;
    for (const id of removedIds) {
      syncPlaylistTrackRemoval(queryClient, next.id, id);
    }
    syncPlaylistCaches(queryClient, next);
  }

  if (trackIds.length === 0) return;

  removeTracksFromCaches(queryClient, trackIds);
  await removeSearchDocuments(trackIds.map(id => `track:${id}`));
};
