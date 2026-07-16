import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { statsQueries } from "@/queries/stats.queries";

export const HISTORY_LIMIT = 100;

export function useHistoryList() {
  const { data, isLoading, isError, refetch } = useQuery(
    statsQueries.recentHistory(HISTORY_LIMIT),
  );

  const entries = computed(() => data.value ?? []);
  const tracks = computed(() => entries.value.map(entry => entry.track));
  const isEmpty = computed(() => !isLoading.value && entries.value.length === 0);

  return {
    entries,
    tracks,
    isLoading,
    isError,
    isEmpty,
    refetch,
  };
}
