import { AudioFeaturesEntity, TrackEntity } from "@/db/entities";
import { trackRepository } from "@/db/repositories";
import { audioFeaturesRepository } from "@/db/repositories/audioFeatures.repository";
import { normalize } from "@/lib/math";
import { TrackId } from "@/types/ids";
import { buildCoOccurrenceMatrix, buildSessions } from "./session-builder.service";
import { statsRepository } from "@/db/repositories/stats.repository";

interface FeatureVector {
  bpm: number; // raw / 250
  energy: number; // 0–1
  spectralCentroid: number; // raw / 8000
  danceability: number; // 0–1
  key: number; // raw / 11
  mode: number; // 0 or 1
}

export function toVector(f: AudioFeaturesEntity) {
  return {
    bpm: normalize(f.bpm, 250),
    energy: f.energy,
    spectralCentroid: normalize(f.spectralCentroid, 8000),
    danceability: f.danceability,
    key: normalize(f.key, 11),
    mode: f.mode,
  };
}

async function getRecentlyPlayedIds(count: number): Promise<TrackId[]> {
  const events = await statsRepository.findAllEvents();
  const seen = new Set<TrackId>();
  const result: TrackId[] = [];

  for (const e of events.sort((a, b) => b.startedAt - a.startedAt)) {
    if (seen.has(e.trackId)) continue;
    seen.add(e.trackId);
    result.push(e.trackId);
    if (result.length >= count) break;
  }

  return result;
}

function euclideanSimilarity(a: FeatureVector, b: FeatureVector): number {
  const keys = Object.keys(a) as (keyof FeatureVector)[];
  let sumSq = 0;
  for (const k of keys) {
    const diff = a[k] - b[k];
    sumSq += diff * diff;
  }
  const maxDist = Math.sqrt(keys.length);
  const dist = Math.sqrt(sumSq);
  return 1 - dist / maxDist;
}

type Weights = {
  audioSimilarity: number;
  coOccurrence: number;
  completionRate: number;
  recencyScore: number;
  likedBonus: number;
};

const WEIGHTS: Weights = {
  audioSimilarity: 0.30,
  coOccurrence: 0.30,
  completionRate: 0.20,
  recencyScore: 0.05,
  likedBonus: 0.15,
};
const RECENCY_DECAY_DAYS = 30;

export interface ScoredTrack {
  trackId: TrackId;
  track: TrackEntity;
  score: number;
  breakdown: {
    audioSimilarity: number;
    coOccurrence: number;
    completionRate: number;
    recencyScore: number;
    likedBonus: number;
  };
}

export const getRecommendations = async (
  sourceTrackId: TrackId,
  limit = 8,
): Promise<ScoredTrack[]> => {
  const allIdsResult = await trackRepository.findAllIds();
  if (allIdsResult.isErr()) return [];

  const recentlyPlayedIds = await getRecentlyPlayedIds(5);
  const excludeSet = new Set([sourceTrackId, ...recentlyPlayedIds]);
  const candidateIds = allIdsResult.value.filter(id => !excludeSet.has(id));
  if (candidateIds.length === 0) return [];

  const [
    sourceFeaturesResult,
    candidateFeaturesResult,
    candidateTracksResult,
    sessions,
    allEvents,
  ] = await Promise.all([
    audioFeaturesRepository.findById(sourceTrackId),
    audioFeaturesRepository.findManyByIds(candidateIds),
    trackRepository.findByIds(candidateIds),
    buildSessions(),
    statsRepository.findAllEvents(),
  ]);

  if (candidateTracksResult.isErr()) return [];

  const coMatrix = buildCoOccurrenceMatrix(sessions);
  const sourcePairs = coMatrix.get(sourceTrackId) ?? new Map<TrackId, number>();
  const maxCoOcc = sourcePairs.size > 0 ? Math.max(...sourcePairs.values()) : 1;

  const completionStats = new Map<TrackId, { completed: number; total: number }>();
  for (const event of allEvents) {
    if (event.skipped) continue;
    const s = completionStats.get(event.trackId) ?? { completed: 0, total: 0 };
    s.total++;
    if (event.completed) s.completed++;
    completionStats.set(event.trackId, s);
  }

  const featuresMap = new Map(
    (candidateFeaturesResult.isOk() ? candidateFeaturesResult.value : [])
      .map(f => [f.trackId, f]),
  );
  const tracksMap = new Map(candidateTracksResult.value.map(t => [t.id, t]));

  const sourceVector = sourceFeaturesResult.isOk() && sourceFeaturesResult.value
    ? toVector(sourceFeaturesResult.value)
    : null;

  const now = Date.now();
  const decayMs = RECENCY_DECAY_DAYS * 86_400_000;
  const scored: ScoredTrack[] = [];

  for (const candidateId of candidateIds) {
    const track = tracksMap.get(candidateId);
    if (!track) continue;

    const candidateFeatures = featuresMap.get(candidateId);
    const audioSimilarity = sourceVector && candidateFeatures
      ? euclideanSimilarity(sourceVector, toVector(candidateFeatures))
      : 0;

    const rawCoOcc = sourcePairs.get(candidateId) ?? 0;
    const coOccurrence = maxCoOcc > 0 ? rawCoOcc / maxCoOcc : 0;

    const stats = completionStats.get(candidateId);
    const completionRate = stats && stats.total > 0
      ? stats.completed / stats.total
      : 0.5;

    const recencyScore = !track.lastPlayedAt
      ? 0.6
      : Math.exp(-(now - track.lastPlayedAt) / decayMs);

    const likedBonus = track.likedAt ? 1.0 : 0.0;

    let w = { ...WEIGHTS };
    if (!sourceVector || !candidateFeatures) {
      const extra = WEIGHTS.audioSimilarity / 4;
      w = {
        audioSimilarity: 0,
        coOccurrence: WEIGHTS.coOccurrence + extra,
        completionRate: WEIGHTS.completionRate + extra,
        recencyScore: WEIGHTS.recencyScore + extra,
        likedBonus: WEIGHTS.likedBonus + extra,
      };
    }
    console.log("Source vector:", sourceVector);
    console.log("Sample candidate vector:", featuresMap.values().next().value
      ? toVector(featuresMap.values().next().value!)
      : null);
    scored.push({
      trackId: candidateId,
      track,
      score:
        audioSimilarity * w.audioSimilarity
        + coOccurrence * w.coOccurrence
        + completionRate * w.completionRate
        + recencyScore * w.recencyScore
        + likedBonus * w.likedBonus,
      breakdown: { audioSimilarity, coOccurrence, completionRate, recencyScore, likedBonus },
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
};
