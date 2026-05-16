import { computed, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { toValue, type MaybeRef } from "vue";
import type { TrackId } from "@/types/ids";
import { recommendationsQueries } from "@/queries/recommendations.queries";

const cacheVersion = ref(0);

export function bumpRecommendationsCache(): void {
  cacheVersion.value++;
}

export function useTrackRecommendations(
  trackId: MaybeRef<TrackId | null | undefined>,
  limit = 8,
) {
  const queryConfig = computed(() => {
    const id = toValue(trackId);
    if (!id) {
      return { ...recommendationsQueries.forTrack("" as TrackId, 0), enabled: false };
    }
    return recommendationsQueries.forTrack(id, cacheVersion.value, limit);
  });

  const { data, isLoading, error } = useQuery(queryConfig);

  return {
    recommendations: computed(() => data.value ?? []),
    isLoading,
    error,
    hasAudioFeatures: computed(() =>
      (data.value ?? []).some(r => r.breakdown.audioSimilarity > 0),
    ),
  };
}
