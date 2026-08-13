import type { TrackMenuSubject } from "@/modules/tracks/components/menu/type";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { promoteTrackToLibrary } from "@/modules/tracks/lib/libraryMembership";
import { invalidateLibraryData } from "@/queries/library.queries";
import { queryClient } from "@/queries/client";
import { enqueueTrackDownload } from "./manager";

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
