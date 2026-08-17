import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { statsQueries } from "@/queries/stats.queries";

type MaybeSince = MaybeRefOrGetter<number | undefined>;

export function useTopTracks(limit: MaybeRefOrGetter<number> = 10, since: MaybeSince = undefined) {
  const { data, isLoading } = useQuery(
    computed(() => statsQueries.topTracks(toValue(limit), toValue(since))),
  );

  return {
    topTracks: computed(() => data.value ?? []),
    isLoading,
  };
}

export function useTopArtists(limit: MaybeRefOrGetter<number> = 5, since: MaybeSince = undefined) {
  const { data, isLoading } = useQuery(
    computed(() => statsQueries.topArtists(toValue(limit), toValue(since))),
  );

  return {
    topArtists: computed(() => data.value ?? []),
    isLoading,
  };
}

export function useTotalListeningTime(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.totalTime(toValue(since))));
}

export function useDailyActivity(days: MaybeRefOrGetter<number> = 30) {
  return useQuery(computed(() => statsQueries.dailyActivity(toValue(days))));
}

export function useTopGenres(limit: MaybeRefOrGetter<number> = 8, since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.topGenres(toValue(limit), toValue(since))));
}

export function useSonicProfile(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.sonicProfile(toValue(since))));
}

export function useStatsSummary(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.summary(toValue(since))));
}

export function useHourlyActivity(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.hourlyActivity(toValue(since))));
}

export function useStatsRecords(since: MaybeSince = undefined) {
  return useQuery(computed(() => statsQueries.records(toValue(since))));
}

export function useStreaks() {
  return useQuery(computed(() => statsQueries.streaks()));
}
