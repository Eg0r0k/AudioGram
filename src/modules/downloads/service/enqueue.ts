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
import type { AlbumId, PlaylistId, TrackId } from "@/types/ids";
import { enqueueTrackDownload } from "./manager";
import { useDownloadsStore } from "./store/downloads.store";

/**
 * Search rows can arrive stripped (no duration, no cover, no album id — YT
 * track-tab and top-result shelves); pinning such a DTO saves a timeless
 * track with no album to group under. When any of the three is missing,
 * refetch the full snapshot from the source and keep the row's own values
 * where it had them — except the artists: `artistIds` and the joined
 * `artistName` describe the same list and must come from one source, or the
 * pin cascade ends up with ids it cannot name (a video row knows only the
 * channel, YT Music knows every credited artist). Best-effort: an offline or
 * unsupported source pins the DTO as it came.
 */
export async function completeDtoForPin(dto: SourceTrackDTO): Promise<SourceTrackDTO> {
  if (dto.duration != null && dto.coverRef && dto.albumId) return dto;

  const provider = sources.forTrack(dto.id);
  if (!provider.isAvailable) return dto;

  const result = await provider.getTrack(dto.id);
  if (result.isErr()) return dto;

  const snapshot = result.value;
  const defined = Object.fromEntries(
    Object.entries(dto).filter(([, value]) => value !== undefined),
  );
  if (snapshot.artistIds?.length) {
    delete defined.artistName;
    delete defined.artistIds;
  }
  return { ...snapshot, ...defined } as SourceTrackDTO;
}

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

  const dto = await completeDtoForPin(subject.dto);
  await ensurePinned({ kind: "remote", dto });
  await invalidateLibraryData(queryClient);
  return enqueueTrackDownload(dto.id, batchId);
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
    const completed = await completeDtoForPin(dto);
    await ensurePinned({ kind: "remote", dto: completed });
    await enqueueTrackDownload(completed.id, batchId);
  }
  await invalidateLibraryData(queryClient);

  // The manager grew the total per created job; nothing created — no batch.
  if ((store.batches[batchId]?.total ?? 0) === 0) {
    store.clearBatch(batchId);
    return null;
  }
  return batchId;
}

/**
 * "Download everything" for a catalog album or playlist, from whichever
 * source its branded id names. Returns the batch id, or null when nothing
 * needed downloading.
 *
 * getAlbum and getPlaylist hand over the whole collection — a source that
 * pages its playlists walks the pages itself — so the batch is never a
 * partial one that merely looks complete.
 */
export async function enqueueCollectionDownload(
  type: "album" | "playlist",
  id: AlbumId | PlaylistId,
): Promise<string | null> {
  // parseTrackRef only reads the source prefix; any branded id is valid input.
  const kind = parseTrackRef(id as unknown as TrackId).kind;
  if (kind === "local") return null;

  const provider = sources.get(kind);
  const result = type === "album"
    ? await provider.getAlbum(id as AlbumId)
    : await provider.getPlaylist(id as PlaylistId);
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
