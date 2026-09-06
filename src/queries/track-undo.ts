import type { QueryClient } from "@tanstack/vue-query";
import type { CoverEntity } from "@/db/entities";
import {
  albumRepository,
  artistRepository,
  coverRepository,
  offlineCopyRepository,
  playlistRepository,
  trackRepository,
} from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { cleanupOfflineCopyFiles } from "@/modules/downloads/service/removeCopy";
import { indexImportedTracks } from "@/modules/search/service/searchIndex";
import type { TrackId } from "@/types/ids";
import { invalidateForTrackMutation, removeCoverCache } from "./cache";
import { queryKeys } from "./query-keys";
import { unique, unwrapResult } from "./shared";
import { findOfflineCopiesOf, trackCascadeTables } from "./track-cascade";
import { deleteTracksAndSync } from "./track.queries";

export interface TrackDeletionUndo {
  deleted: number;
  /** Puts every deleted row back; a no-op once finalized. */
  restore: () => Promise<void>;
  /** Deletes the offline copy files the cascade left behind; a no-op once restored. */
  finalize: () => Promise<void>;
}

const noop = async () => {};

const gone = <T extends { id: string }>(before: readonly T[], after: readonly T[]) => {
  const alive = new Set(after.map(row => row.id));
  return before.filter(row => !alive.has(row.id));
};

// Local audio files are never part of the track cascade, so undo is a row
// snapshot: what the cascade deletes (tracks, their covers, offline copies,
// playlist references, orphaned albums and artists) is read before it runs
// and written back on restore. Only copy files on disk are deferred.
export const deleteTracksWithUndo = async (
  queryClient: QueryClient,
  ids: TrackId[],
): Promise<TrackDeletionUndo> => {
  const tracks = await unwrapResult(trackRepository.findByIds(ids));
  if (tracks.length === 0) return { deleted: 0, restore: noop, finalize: noop };

  const trackIds = tracks.map(track => track.id);
  const trackIdSet = new Set<string>(trackIds);
  const albumIds = unique(tracks.map(track => track.albumId).filter(Boolean));
  const albums = await unwrapResult(albumRepository.findByIds(albumIds));
  const artistIds = unique([
    ...tracks.flatMap(track => track.artistIds),
    ...albums.map(album => album.artistId),
  ]);

  const [artists, copies, trackCovers, albumCovers, artistCovers, playlists] = await Promise.all([
    unwrapResult(artistRepository.findByIds(artistIds)),
    findOfflineCopiesOf(trackIds),
    unwrapResult(coverRepository.findByOwners("track", trackIds)),
    unwrapResult(coverRepository.findByOwners("album", albumIds)),
    unwrapResult(coverRepository.findByOwners("artist", artistIds)),
    unwrapResult(playlistRepository.findAll()),
  ]);
  const playlistOrders = playlists
    .filter(playlist => playlist.trackIds.some(id => trackIdSet.has(id)))
    .map(playlist => ({ id: playlist.id, trackIds: [...playlist.trackIds] }));

  const deleted = await deleteTracksAndSync(queryClient, trackIds, { deferCopyFiles: true });

  const [albumsAfter, artistsAfter] = await Promise.all([
    unwrapResult(albumRepository.findByIds(albumIds)),
    unwrapResult(artistRepository.findByIds(artistIds)),
  ]);
  const goneAlbums = gone(albums, albumsAfter);
  const goneArtists = gone(artists, artistsAfter);
  const goneOwners = new Set<string>([...goneAlbums, ...goneArtists].map(row => row.id));
  const covers: CoverEntity[] = [
    ...trackCovers,
    ...albumCovers.filter(cover => goneOwners.has(cover.ownerId)),
    ...artistCovers.filter(cover => goneOwners.has(cover.ownerId)),
  ];

  let settled = false;

  const finalize = async () => {
    if (settled) return;
    settled = true;
    await cleanupOfflineCopyFiles(copies);
  };

  const restore = async () => {
    if (settled) return;
    settled = true;
    const now = Date.now();
    const tx = await unitOfWork.runScoped(trackCascadeTables(), async () => {
      if (goneArtists.length > 0) await unwrapResult(artistRepository.upsertMany(goneArtists));
      if (goneAlbums.length > 0) await unwrapResult(albumRepository.upsertMany(goneAlbums));
      await unwrapResult(trackRepository.upsertMany(tracks));
      if (copies.length > 0) await unwrapResult(offlineCopyRepository.upsertMany(copies));
      if (covers.length > 0) await unwrapResult(coverRepository.upsertMany(covers));

      const existing = new Set(
        (await unwrapResult(playlistRepository.findByIds(playlistOrders.map(order => order.id))))
          .map(playlist => playlist.id),
      );
      const updates = playlistOrders
        .filter(order => existing.has(order.id))
        .map(order => ({ key: order.id, changes: { trackIds: order.trackIds, updatedAt: now } }));
      if (updates.length > 0) await unwrapResult(playlistRepository.updateMany(updates));
    });
    if (tx.isErr()) throw tx.error;

    await indexImportedTracks(trackIds);
    // Only the restored owners re-read their covers; a library-wide cover
    // invalidation would make every visible cover blink.
    for (const cover of covers) removeCoverCache(cover.ownerType, cover.ownerId);
    for (const id of trackIds) removeCoverCache("track", id);
    // The delete parked these on null; no invalidation reaches offlineCopies.
    for (const copy of copies) queryClient.setQueryData(queryKeys.offlineCopies.detail(copy.trackId), copy);
    await invalidateForTrackMutation(queryClient, { kind: "relations" });
  };

  return { deleted, restore, finalize };
};
