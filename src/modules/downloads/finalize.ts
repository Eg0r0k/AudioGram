import type { DownloadJobEntity } from "@/db/entities";
import { offlineCopyRepository } from "@/db/repositories";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { queryClient } from "@/queries/client";
import { queryKeys } from "@/queries/query-keys";
import { unwrapResult } from "@/queries/shared";
import { parseTrackRef } from "@/types/track-ref";

/**
 * Turns a finished temp download into an offline copy: the file moves into
 * `offline/<source>/<rawId>.<ext>` (raw remote id — branded ids carry a ":"
 * that Windows filenames reject), the copy row lands in Dexie, and the
 * offlineCopy query cache is updated in place so menus/buttons flip to
 * "downloaded" without a refetch.
 */
export async function finalizeOfflineCopy(
  job: DownloadJobEntity,
  file: { path: string; format?: { codec?: string } },
): Promise<void> {
  if (!hasNativeSupport(storageService)) {
    throw new Error("offline copies require native storage");
  }

  const ref = parseTrackRef(job.trackId);
  if (ref.kind === "local") {
    throw new Error("local tracks have no offline copies");
  }
  const rawId = ref.kind === "nd" ? ref.songId : ref.videoId;
  const ext = file.path.split(".").pop()?.toLowerCase() || "bin";

  const imported = await storageService.importFile(file.path, `offline/${ref.kind}/${rawId}.${ext}`);
  if (imported.isErr()) throw imported.error;
  const storedPath = imported.value;
  // Size feeds storage-info only — its failure must not undo the download.
  const sizeResult = await storageService.getFileSize(storedPath);
  const sizeBytes = sizeResult.isOk() ? sizeResult.value : 0;

  const copy = {
    trackId: job.trackId,
    storagePath: storedPath,
    sizeBytes,
    format: file.format ?? {},
    downloadedAt: Date.now(),
  };
  await unwrapResult(offlineCopyRepository.upsert(copy));
  queryClient.setQueryData(queryKeys.offlineCopies.detail(job.trackId), copy);
}
