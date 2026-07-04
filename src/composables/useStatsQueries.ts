import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { statsQueries } from "@/queries/stats.queries";
import type { ArtistId, TrackId } from "@/types/ids";

export function useTopTracks(limit = 10, since?: number) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topTracks(limit, since)),
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

export function useTopArtists(limit = 5, since?: number) {
  const { data: topEntries, isLoading: isEntriesLoading } = useQuery(
    computed(() => statsQueries.topArtists(limit, since)),
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

export function useTotalListeningTime(since?: number) {
  return useQuery(computed(() => statsQueries.totalTime(since)));
}

export function useDailyActivity(days = 30) {
  return useQuery(computed(() => statsQueries.dailyActivity(days)));
}

export function useTopGenres(limit = 8, since?: number) {
  return useQuery(computed(() => statsQueries.topGenres(limit, since)));
}

export function useSonicProfile(since?: number) {
  return useQuery(computed(() => statsQueries.sonicProfile(since)));
}
