import { queryOptions } from "@tanstack/vue-query";
import { audioFeaturesRepository } from "@/db/repositories/audioFeatures.repository";
import { db } from "@/db";
import type { TrackId } from "@/types/ids";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";
import { queryKeys } from "./query-keys";

export const recommendationsQueries = {
  forTrack: (trackId: TrackId, cacheVersion: number, limit = 8) =>
    queryOptions({
      queryKey: queryKeys.recommendations.forTrack(trackId, cacheVersion, limit),
      queryFn: () => getRecommendations(trackId, limit),
      staleTime: 5 * 60 * 1000,
      enabled: Boolean(trackId),
    }),

  analysisProgress: () =>
    queryOptions({
      queryKey: queryKeys.recommendations.analysisProgress(),
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
