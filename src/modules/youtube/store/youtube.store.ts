import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { youtubeProvider } from "../provider";

export type YtDownloadStatus
  = | "downloading"
    | "processing"
    | "importing"
    | "done"
    | "error";

export interface YtDownloadState {
  status: YtDownloadStatus;
  /** 0–100, or null when total size is unknown / during post-processing. */
  percent: number | null;
  error?: string;
}

/**
 * Cross-page imperative YouTube state: per-video download progress and the
 * id currently resolving to a stream. Search state lives in the unified
 * search module (`useSearch`) and TanStack Query.
 */
export const useYoutubeStore = defineStore("youtube", () => {
  const downloads = ref<Record<string, YtDownloadState>>({});
  /** Item id currently being resolved to a stream URL (spinner). */
  const resolvingId = ref<string | null>(null);

  const isAvailable = computed(() => youtubeProvider.isAvailable);

  const setDownload = (id: string, state: YtDownloadState): void => {
    downloads.value = { ...downloads.value, [id]: state };
  };

  return {
    downloads,
    resolvingId,
    isAvailable,
    setDownload,
  };
});
