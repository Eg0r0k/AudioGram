import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { youtubeProvider } from "../provider";

/**
 * Cross-page imperative YouTube state: the id currently resolving to a
 * stream. Download progress lives in the shared downloads store since M5;
 * search state lives in the unified search module and TanStack Query.
 */
export const useYoutubeStore = defineStore("youtube", () => {
  /** Item id currently being resolved to a stream URL (spinner). */
  const resolvingId = ref<string | null>(null);

  const isAvailable = computed(() => youtubeProvider.isAvailable);

  return {
    resolvingId,
    isAvailable,
  };
});
