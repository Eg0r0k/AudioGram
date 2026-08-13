import { offlineCopyRepository } from "@/db/repositories";
import { storageService } from "@/db/storage";
import { getLogger } from "@/lib/logger";
import { queryClient } from "@/queries/client";
import { queryKeys } from "@/queries/query-keys";
import { unwrapResult } from "@/queries/shared";
import type { TrackId } from "@/types/ids";

/**
 * Deletes the offline copy — row first (a dangling DB row is worse than a
 * leftover file), then the file, then the point cache sync. The track row
 * itself is untouched: it keeps playing over the live stream.
 */
export async function removeOfflineCopy(trackId: TrackId): Promise<void> {
  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));
  if (!copy) return;

  await unwrapResult(offlineCopyRepository.delete(trackId));
  const deleted = await storageService.deleteFile(copy.storagePath);
  if (deleted.isErr()) {
    getLogger().warn(`[Downloads] Failed to delete offline copy file: ${deleted.error.message}`);
  }
  queryClient.setQueryData(queryKeys.offlineCopies.detail(trackId), null);
}
