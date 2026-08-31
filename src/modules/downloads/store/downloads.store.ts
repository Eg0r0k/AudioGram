import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { TrackId } from "@/types/ids";

export interface DownloadRuntime {
  jobId: string;
  trackId: TrackId;
  batchId?: string;
  status: "queued" | "running";
  downloaded: number;
  total: number | null;
  cancelling: boolean;
}

/**
 * Runtime mirror of the active download queue — progress and statuses the
 * UI reads reactively. Dexie's downloadJobs table stays the source of truth
 * for persistence; the manager is the only writer here.
 */
export interface BatchProgress {
  /** Jobs actually queued for this batch — filtered tracks never count. */
  total: number;
  finished: number;
  failed: number;
}

export const useDownloadsStore = defineStore("downloads", () => {
  const jobs = ref<Record<string, DownloadRuntime>>({});
  const batches = ref<Record<string, BatchProgress>>({});

  const byTrackId = computed(() => {
    const map: Partial<Record<TrackId, DownloadRuntime>> = {};
    for (const job of Object.values(jobs.value)) {
      map[job.trackId] = job;
    }
    return map;
  });

  function upsert(job: DownloadRuntime): void {
    jobs.value[job.jobId] = job;
  }

  function setStatus(jobId: string, status: DownloadRuntime["status"]): void {
    const job = jobs.value[jobId] as DownloadRuntime | undefined;
    if (job) job.status = status;
  }

  function setProgress(jobId: string, downloaded: number, total: number | null): void {
    const job = jobs.value[jobId] as DownloadRuntime | undefined;
    if (!job) return;
    job.downloaded = downloaded;
    job.total = total;
  }

  function markCancelling(jobId: string): void {
    const job = jobs.value[jobId] as DownloadRuntime | undefined;
    if (job) job.cancelling = true;
  }

  function remove(jobId: string): void {
    delete jobs.value[jobId];
  }

  function ensureBatch(batchId: string): BatchProgress {
    batches.value[batchId] ??= { total: 0, finished: 0, failed: 0 };
    return batches.value[batchId];
  }

  function registerBatch(batchId: string): void {
    ensureBatch(batchId);
  }

  /**
   * Counts a job into its batch the moment it is created — jobs can finish
   * (and delete their persisted row) before the whole batch is enqueued, so
   * a post-hoc row count would undercount.
   */
  function growBatch(batchId: string): void {
    ensureBatch(batchId).total += 1;
  }

  function bumpBatch(batchId: string, outcome: "finished" | "failed"): void {
    ensureBatch(batchId)[outcome] += 1;
  }

  /** A cancelled job leaves its batch entirely (cancel = changed my mind). */
  function shrinkBatch(batchId: string): void {
    const batch = batches.value[batchId] as BatchProgress | undefined;
    if (batch) batch.total = Math.max(0, batch.total - 1);
  }

  function clearBatch(batchId: string): void {
    delete batches.value[batchId];
  }

  return {
    jobs,
    batches,
    byTrackId,
    upsert,
    setStatus,
    setProgress,
    markCancelling,
    remove,
    registerBatch,
    growBatch,
    bumpBatch,
    shrinkBatch,
    clearBatch,
  };
});
