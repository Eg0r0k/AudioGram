import { db } from "@/db";
import { offlineCopyRepository, playlistRepository, trackRepository } from "@/db/repositories";
import { unitOfWork } from "@/db/unit-of-work";
import { storageService } from "@/db/storage";
import { unwrapResult } from "@/queries/shared";
import { getLogger } from "@/lib/logger";
import { indexImportedTracks, removeSearchDocuments } from "@/modules/search/service/searchIndex";
import type { TrackId } from "@/types/ids";
import { parseTrackRef } from "@/types/track-ref";

/**
 * Upgrades a shadow remote row to a full library member, cascading
 * pinned = 1 onto its album/artist rows in one unitOfWork.
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

  indexImportedTracks([trackId]).catch((error) => {
    getLogger().warn(`[Search] Indexing promoted ${trackId} failed: ${String(error)}`);
  });
}

/**
 * Remote counterpart of "Delete track": cascades playlists/like/offline copy
 * in one unitOfWork; the row degrades to a shadow so history survives.
 */
export async function removeTrackFromLibrary(trackId: TrackId): Promise<void> {
  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));

  const result = await unitOfWork.runScoped(
    [db.tracks, db.albums, db.artists, db.playlists, db.offlineCopies],
    async () => {
      const track = await unwrapResult(trackRepository.findById(trackId));

      const playlists = await unwrapResult(playlistRepository.findAll());
      for (const playlist of playlists) {
        if (!playlist.trackIds.includes(trackId)) continue;
        await unwrapResult(playlistRepository.update(playlist.id, {
          trackIds: playlist.trackIds.filter(id => id !== trackId),
        }));
      }

      await unwrapResult(trackRepository.update(trackId, { pinned: 0, likedAt: undefined }));
      await unwrapResult(offlineCopyRepository.delete(trackId));

      // Recalculate the album/artist pinned flags — no ghost albums after
      // the last library track leaves. Local rows are never touched.
      const demotedDocIds: string[] = [];
      if (track?.albumId && parseTrackRef(track.albumId as unknown as TrackId).kind !== "local") {
        const stillPinned = await db.tracks
          .where("[albumId+pinned]").equals([track.albumId, 1])
          .count();
        if (stillPinned === 0) {
          await db.albums.update(track.albumId, { pinned: 0 });
          demotedDocIds.push(`album:${track.albumId}`);
        }
      }
      for (const artistId of track?.artistIds ?? []) {
        if (parseTrackRef(artistId as unknown as TrackId).kind === "local") continue;
        const stillPinned = await db.tracks
          .where("artistIds").equals(artistId)
          .and(candidate => candidate.pinned === 1)
          .count();
        if (stillPinned === 0) {
          await db.artists.update(artistId, { pinned: 0 });
          demotedDocIds.push(`artist:${artistId}`);
        }
      }
      return demotedDocIds;
    },
  );
  if (result.isErr()) throw result.error;

  removeSearchDocuments([`track:${trackId}`, ...result.value]).catch((error) => {
    getLogger().warn(`[Search] De-indexing removed ${trackId} failed: ${String(error)}`);
  });

  // File deletion happens strictly after the DB transaction.
  if (copy) {
    const deleted = await storageService.deleteFile(copy.storagePath);
    if (deleted.isErr()) {
      getLogger().warn(`[Library] Failed to delete offline copy file: ${deleted.error.message}`);
    }
  }
}
