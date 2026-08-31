import type { OfflineCopyEntity } from "@/db/entities";
import { offlineCopyRepository } from "@/db/repositories";
import { storageService } from "@/db/storage";
import { getLogger } from "@/lib/logger";
import { queryClient } from "@/queries/client";
import { queryKeys } from "@/queries/query-keys";
import { unwrapResult } from "@/queries/shared";
import type { TrackId } from "@/types/ids";

/**
 * Post-commit half of an offline-copy removal: best-effort file deletion +
 * point cache sync. Must run strictly AFTER the Dexie transaction — file IO
 * inside it would commit it prematurely.
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
 * Deletes the offline copy: row first, then the file. The track row is
 * untouched — it keeps playing over the live stream.
 */
export async function removeOfflineCopy(trackId: TrackId): Promise<void> {
  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));
  if (!copy) return;

  await unwrapResult(offlineCopyRepository.delete(trackId));
  await cleanupOfflineCopyFiles([copy]);
}
