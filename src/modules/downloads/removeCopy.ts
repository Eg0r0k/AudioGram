import type { OfflineCopyEntity } from "@/db/entities";
import { offlineCopyRepository } from "@/db/repositories";
import { storageService } from "@/db/storage";
import { getLogger } from "@/lib/logger";
import { queryClient } from "@/queries/client";
import { queryKeys } from "@/queries/query-keys";
import { unwrapResult } from "@/queries/shared";
import type { TrackId } from "@/types/ids";

/**
 * Post-commit half of an offline-copy removal: the rows are already gone
 * from the database, so delete the files best-effort (a leftover file is
 * recoverable garbage, a dangling DB row is not) and sync the point caches.
 * Callers that batch row deletes into a wider Dexie transaction must call
 * this strictly after the commit — file IO inside the transaction would
 * commit it prematurely.
 */
export async function cleanupOfflineCopyFiles(copies: readonly OfflineCopyEntity[]): Promise<void> {
  for (const copy of copies) {
    const deleted = await storageService.deleteFile(copy.storagePath);
    if (deleted.isErr()) {
      getLogger().warn(`[Downloads] Failed to delete offline copy file: ${deleted.error.message}`);
    }
    queryClient.setQueryData(queryKeys.offlineCopies.detail(copy.trackId), null);
  }
}

/**
 * Deletes the offline copy — row first (a dangling DB row is worse than a
 * leftover file), then the file, then the point cache sync. The track row
 * itself is untouched: it keeps playing over the live stream.
 */
export async function removeOfflineCopy(trackId: TrackId): Promise<void> {
  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));
  if (!copy) return;

  await unwrapResult(offlineCopyRepository.delete(trackId));
  await cleanupOfflineCopyFiles([copy]);
}
