import { db } from "@/db";
import { offlineCopyRepository, playlistRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { storageService } from "@/db/storage";
import { unwrapResult } from "@/queries/shared";
import { getLogger } from "@/lib/logger";
import type { TrackId } from "@/types/ids";

/**
 * Upgrades an existing (shadow) remote row to a full library member,
 * cascading pinned = 1 onto its shadow album/artist rows — the counterpart
 * of the pin cascade in ensurePinned, strictly inside one unitOfWork.
 */
export async function promoteTrackToLibrary(trackId: TrackId): Promise<void> {
  const result = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists],
    async () => {
      const track = await unwrapResult(trackRepository.findById(trackId));
      if (!track) throw new Error(`Track not found: ${trackId}`);

      await unwrapResult(trackRepository.update(trackId, { pinned: 1 }));
      if (track.albumId) {
        await db.albums.update(track.albumId, { pinned: 1 });
      }
      for (const artistId of track.artistIds) {
        await db.artists.update(artistId, { pinned: 1 });
      }
    },
  );
  if (result.isErr()) throw result.error;
}

/**
 * The remote counterpart of "Delete track": removes the track from every
 * playlist, clears the like, drops the offline copy row — all in one
 * unitOfWork — then deletes the copy's file. The track row itself degrades
 * to a shadow (pinned = 0), so history and stats stay intact.
 */
export async function removeTrackFromLibrary(trackId: TrackId): Promise<void> {
  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));

  const result = await unitOfWork.runScoped(
    [db.tracks, db.playlists, db.offlineCopies],
    async () => {
      const playlists = await unwrapResult(playlistRepository.findAll());
      for (const playlist of playlists) {
        if (!playlist.trackIds.includes(trackId)) continue;
        await unwrapResult(playlistRepository.update(playlist.id, {
          trackIds: playlist.trackIds.filter(id => id !== trackId),
        }));
      }

      await unwrapResult(trackRepository.update(trackId, { pinned: 0, likedAt: undefined }));
      await unwrapResult(offlineCopyRepository.delete(trackId));
    },
  );
  if (result.isErr()) throw result.error;

  // File deletion happens outside the DB transaction; a leftover file is
  // recoverable garbage, a dangling DB row is not.
  if (copy) {
    const deleted = await storageService.deleteFile(copy.storagePath);
    if (deleted.isErr()) {
      getLogger().warn(`[Library] Failed to delete offline copy file: ${deleted.error.message}`);
    }
  }
}
