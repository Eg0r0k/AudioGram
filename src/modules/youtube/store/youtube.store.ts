import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { youtubeProvider } from "../provider";
import type { YoutubeError, YtSearchResult } from "../types";

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

export const useYoutubeStore = defineStore("youtube", () => {
  const query = ref("");
  const results = ref<YtSearchResult[]>([]);
  const isSearching = ref(false);
  const error = ref<YoutubeError | null>(null);
  const downloads = ref<Record<string, YtDownloadState>>({});
  /** Search result id currently being resolved to a stream URL (spinner). */
  const resolvingId = ref<string | null>(null);

  const isAvailable = computed(() => youtubeProvider.isAvailable);
  const hasResults = computed(() => results.value.length > 0);

  const search = async (): Promise<void> => {
    const q = query.value.trim();
    if (!q || isSearching.value) return;

    isSearching.value = true;
    error.value = null;

    const result = await youtubeProvider.search(q);
    result.match(
      (list) => {
        results.value = list;
      },
      (e) => {
        error.value = e;
        results.value = [];
      },
    );

    isSearching.value = false;
  };

  const setDownload = (id: string, state: YtDownloadState): void => {
    downloads.value = { ...downloads.value, [id]: state };
  };

  const reset = (): void => {
    query.value = "";
    results.value = [];
    error.value = null;
  };

  return {
    query,
    results,
    isSearching,
    error,
    downloads,
    resolvingId,
    isAvailable,
    hasResults,
    search,
    setDownload,
    reset,
  };
});
