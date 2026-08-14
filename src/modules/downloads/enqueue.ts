import type { TrackMenuSubject } from "@/modules/tracks/components/menu/type";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { promoteTrackToLibrary } from "@/modules/tracks/lib/libraryMembership";
import { invalidateLibraryData } from "@/queries/library.queries";
import { queryClient } from "@/queries/client";
import { unwrapResult } from "@/queries/shared";
import { sources } from "@/modules/sources";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { playlistRepository, trackRepository } from "@/db/repositories";
import { parseTrackRef } from "@/types/track-ref";
import type { AlbumId, PlaylistId } from "@/types/ids";
import { enqueueTrackDownload } from "./manager";
import { useDownloadsStore } from "./store/downloads.store";

/**
 * Download = library membership (§1): queuing a download pins the subject at
 * pinned = 1 (with the album/artist cascade) before the job is created.
 * Returns the job id, or null when an offline copy already exists.
 */
export async function downloadSubject(subject: TrackMenuSubject, batchId?: string): Promise<string | null> {
  if (subject.kind === "ephemeral") {
    throw new Error("Ephemeral tracks have no library identity and cannot be downloaded");
  }

  if (subject.kind === "library") {
    if ((subject.track.pinned ?? 1) === 0) {
      await promoteTrackToLibrary(subject.track.id);
      await invalidateLibraryData(queryClient);
    }
    return enqueueTrackDownload(subject.track.id, batchId);
  }

  await ensurePinned(subject);
  await invalidateLibraryData(queryClient);
  return enqueueTrackDownload(subject.dto.id, batchId);
}

/**
 * Pins every DTO and queues its job under one batch. The batch total counts
 * only jobs actually created for this batch — tracks that already hold an
 * offline copy (or an active job from elsewhere) never enter the progress.
 * Callers: ND album/playlist below, YT collection pages (M5).
 */
export async function enqueueSourceTracksDownload(tracks: SourceTrackDTO[]): Promise<string | null> {
  if (tracks.length === 0) return null;
  const store = useDownloadsStore();
  const batchId = crypto.randomUUID();
  store.registerBatch(batchId);

  for (const dto of tracks) {
    await ensurePinned({ kind: "remote", dto });
    await enqueueTrackDownload(dto.id, batchId);
  }
  await invalidateLibraryData(queryClient);

  // The manager grew the total per created job; nothing created — no batch.
  if ((store.batches[batchId]?.total ?? 0) === 0) {
    store.clearBatch(batchId);
    return null;
  }
  return batchId;
}

/** "Download album" from an ND album page. Returns the batch id, or null
 * when nothing needed downloading. */
export async function enqueueNdAlbumDownload(albumId: AlbumId): Promise<string | null> {
  const result = await sources.get("nd").getAlbum(albumId);
  if (result.isErr()) throw new Error(result.error.message);
  return enqueueSourceTracksDownload(result.value.tracks);
}

/** "Download playlist" from an ND playlist page (raw server id, no prefix). */
export async function enqueueNdPlaylistDownload(rawPlaylistId: string): Promise<string | null> {
  const result = await sources.get("nd").getPlaylist(rawPlaylistId);
  if (result.isErr()) throw new Error(result.error.message);
  return enqueueSourceTracksDownload(result.value.tracks);
}

/**
 * "Download playlist" on a local playlist: mixed content is filtered to the
 * tracks that can hold an offline copy — any remote row (ND and, since M5,
 * YT). Filtered-out local tracks never enter the batch.
 */
export async function enqueueLocalPlaylistDownload(playlistId: PlaylistId): Promise<string | null> {
  const playlist = await unwrapResult(playlistRepository.findById(playlistId));
  if (!playlist) return null;
  const tracks = await unwrapResult(trackRepository.findByIds(playlist.trackIds));
  const downloadable = tracks.filter(track => parseTrackRef(track.id).kind !== "local");
  if (downloadable.length === 0) return null;

  const store = useDownloadsStore();
  const batchId = crypto.randomUUID();
  store.registerBatch(batchId);

  for (const track of downloadable) {
    // Download = library membership: shadow rows get promoted on the way in.
    if (track.pinned === 0) await promoteTrackToLibrary(track.id);
    await enqueueTrackDownload(track.id, batchId);
  }
  await invalidateLibraryData(queryClient);

  if ((store.batches[batchId]?.total ?? 0) === 0) {
    store.clearBatch(batchId);
    return null;
  }
  return batchId;
}
