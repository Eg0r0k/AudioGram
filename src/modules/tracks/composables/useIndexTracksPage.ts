import { useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { queryKeys } from "@/queries/query-keys";
import { getTracksPaginated, trackQueries } from "@/queries/track.queries";
import type { TrackSortKey } from "@/modules/tracks/types";

export function useIndexTracksPage(sortKey: Ref<TrackSortKey | null>, searchQuery: Ref<string>) {
  const normalizedSearchQuery = computed(() => searchQuery.value.trim());
  const resolvedSortKey = computed<TrackSortKey>(() => sortKey.value ?? "date_added_desc");

  const queryState = useInfiniteQuery({
    queryKey: computed(() => queryKeys.tracks.indexInfinite(resolvedSortKey.value, normalizedSearchQuery.value)),
    queryFn: ({ pageParam = 0 }) =>
      getTracksPaginated(pageParam, normalizedSearchQuery.value, undefined, resolvedSortKey.value),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    placeholderData: previousData => previousData,
  });

  const { data: indexTotalDurationSeconds } = useQuery(
    computed(() => trackQueries.indexTotalDuration(normalizedSearchQuery.value)),
  );

  const tracks = computed(() => queryState.data.value?.pages.flatMap(page => page.tracks) ?? []);
  const total = computed(() => queryState.data.value?.pages[0]?.total ?? 0);
  const totalDuration = computed(() => indexTotalDurationSeconds.value ?? 0);

  return {
    ...queryState,
    resolvedSortKey,
    normalizedSearchQuery,
    tracks,
    total,
    totalDuration,
  };
}
