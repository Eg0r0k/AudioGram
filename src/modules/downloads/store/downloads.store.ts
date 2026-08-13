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
export const useDownloadsStore = defineStore("downloads", () => {
  const jobs = ref<Record<string, DownloadRuntime>>({});

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
    const job = jobs.value[jobId];
    if (job) job.status = status;
  }

  function setProgress(jobId: string, downloaded: number, total: number | null): void {
    const job = jobs.value[jobId];
    if (!job) return;
    job.downloaded = downloaded;
    job.total = total;
  }

  function markCancelling(jobId: string): void {
    const job = jobs.value[jobId];
    if (job) job.cancelling = true;
  }

  function remove(jobId: string): void {
    delete jobs.value[jobId];
  }

  return { jobs, byTrackId, upsert, setStatus, setProgress, markCancelling, remove };
});
