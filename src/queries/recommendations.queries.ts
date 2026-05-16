import { queryOptions } from "@tanstack/vue-query";
import { audioFeaturesRepository } from "@/db/repositories/audioFeatures.repository";
import { db } from "@/db";
import type { TrackId } from "@/types/ids";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";

export const recommendationsQueries = {
  forTrack: (trackId: TrackId, cacheVersion: number, limit = 8) =>
    queryOptions({
      queryKey: ["recommendations", "forTrack", trackId, cacheVersion] as const,
      queryFn: () => getRecommendations(trackId, limit),
      staleTime: 5 * 60 * 1000,
      enabled: Boolean(trackId),
    }),

  analysisProgress: () =>
    queryOptions({
      queryKey: ["recommendations", "analysisProgress"] as const,
      queryFn: async () => {
        const [analyzedResult, total] = await Promise.all([
          audioFeaturesRepository.countAnalyzed(),
          db.tracks.count(),
        ]);
        const analyzed = analyzedResult.isOk() ? analyzedResult.value : 0;
        return { analyzed, total, percent: total > 0 ? analyzed / total : 0 };
      },
      staleTime: 5_000,
    }),
} as const;
