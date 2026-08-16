import { useQuery } from "@tanstack/vue-query";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { statsQueries } from "@/queries/stats.queries";
import type { ArtistId, TrackId } from "@/types/ids";

type MaybeSince = MaybeRefOrGetter<number | undefined>;

export function useTopTracks(limit: MaybeRefOrGetter<number> = 10, since: MaybeSince = undefined) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topTracks(toValue(limit), toValue(since))),
  );

  const trackIds = computed(() =>
    (topEntries.value ?? []).map(entry => entry.id),
  );

  const { data: tracks, isLoading: isTracksLoading } = useQuery(
    computed(() => ({
      ...statsQueries.topTracksMeta(trackIds.value),
      enabled: trackIds.value.length > 0,
    })),
  );

  const topTracks = computed(() => {
    if (!topEntries.value || !tracks.value) {
      return [];
    }

    const trackMap = new Map(tracks.value.map(track => [track.id, track]));

    return topEntries.value
      .map(entry => ({
        ...entry,
        track: trackMap.get(entry.id as TrackId) ?? null,
      }))
      .filter(entry => entry.track !== null);
  });

  return {
    topTracks,
    isLoading: computed(() => isEntriesLoading.value || isTracksLoading.value),
  };
}

export function useTopArtists(limit: MaybeRefOrGetter<number> = 5, since: MaybeSince = undefined) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topArtists(toValue(limit), toValue(since))),
  );

  const artistIds = computed(() =>
    (topEntries.value ?? []).map(entry => entry.id),
  );

  const { data: artists, isLoading: isArtistsLoading } = useQuery(
    computed(() => ({
      ...statsQueries.topArtistsMeta(artistIds.value),
      enabled: artistIds.value.length > 0,
    })),
  );

  const topArtists = computed(() => {
    if (!topEntries.value || !artists.value) {
      return [];
    }

    const artistMap = new Map(artists.value.map(artist => [artist.id, artist]));

    return topEntries.value
      .map(entry => ({
        ...entry,
        artist: artistMap.get(entry.id as ArtistId) ?? null,
      }))
      .filter(entry => entry.artist !== null);
  });

  return {
    topArtists,
    isLoading: computed(() => isEntriesLoading.value || isArtistsLoading.value),
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
