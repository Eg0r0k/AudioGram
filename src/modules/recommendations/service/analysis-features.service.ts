import { audioFeaturesRepository, CURRENT_ALGORITHM_VERSION } from "@/db/repositories/audioFeatures.repository";
import { trackRepository } from "@/db/repositories";
import type { AudioFeaturesEntity } from "@/db/entities";
import type { TrackId } from "@/types/ids";

type ExtractedFeatures = Omit<AudioFeaturesEntity, "trackId" | "analyzedAt" | "algorithmVersion">;

/**
 * The audio-analysis queue's data access, kept out of the composable that
 * drives the worker. Every read answers with a plain value or null: a DB
 * failure here only means "nothing to analyse this round", never a crash in
 * the idle-time loop.
 */

/** Storage path of the track to decode, or null when there is nothing to read. */
export const getAnalysisSourcePath = async (trackId: TrackId): Promise<string | null> => {
  const result = await trackRepository.findById(trackId);
  if (result.isErr()) return null;
  return result.value?.storagePath ?? null;
};

/** Track ids with no features for the current algorithm version. */
export const getUnanalyzedTrackIds = async (): Promise<TrackId[]> => {
  const result = await audioFeaturesRepository.findUnanalyzedIds();
  return result.isOk() ? result.value : [];
};

export const saveAnalyzedFeatures = async (
  trackId: TrackId,
  features: ExtractedFeatures,
): Promise<void> => {
  await audioFeaturesRepository.upsert({
    trackId,
    ...features,
    analyzedAt: Date.now(),
    algorithmVersion: CURRENT_ALGORITHM_VERSION,
  });
};
