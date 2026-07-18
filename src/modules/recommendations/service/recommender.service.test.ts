import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err } from "neverthrow";
import { getRecommendations, toVector } from "@/modules/recommendations/service/recommender.service";
import type { TrackId } from "@/types/ids";
import type { AudioFeaturesEntity, ListenEventEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";

// ── Helpers ────────────────────────────────────────────────────────────────

const tid = (s: string) => s as TrackId;

function makeTrack(id: string, overrides: Partial<TrackEntity> = {}): TrackEntity {
  return {
    id: tid(id),
    title: `Track ${id}`,
    artistName: "Test Artist",
    albumTitle: "Test Album",
    artistIds: [],
    albumId: "album-1" as any,
    tagIds: [],
    source: TrackSource.LOCAL_INTERNAL,
    storagePath: `tracks/${id}.mp3`,
    state: TrackState.READY,
    duration: 200,
    format: { codec: "MP3", bitrate: 320000, sampleRate: 44100, lossless: false, channels: 2 },
    playCount: 0,
    addedAt: Date.now(),
    ...overrides,
  };
}

function makeFeatures(
  trackId: string,
  overrides: Partial<Omit<AudioFeaturesEntity, "trackId">> = {},
): AudioFeaturesEntity {
  return {
    trackId: tid(trackId),
    bpm: 100,
    energy: 0.5,
    spectralCentroid: 2000,
    danceability: 0.5,
    key: 0,
    mode: 1,
    analyzedAt: Date.now(),
    algorithmVersion: 1,
    ...overrides,
  };
}

function makeEvent(
  trackId: string,
  overrides: Partial<ListenEventEntity> = {},
): ListenEventEntity {
  return {
    id: crypto.randomUUID(),
    trackId: tid(trackId),
    artistId: "artist-1" as any,
    albumId: "album-1" as any,
    startedAt: Date.now() - 60_000,
    secondsListened: 180,
    trackDuration: 200_000,
    completed: true,
    skipped: false,
    ...overrides,
  };
}

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/db/repositories", () => ({
  trackRepository: {
    findAllIds: vi.fn(),
    findByIds: vi.fn(),
  },
}));

vi.mock("@/db/repositories/audioFeatures.repository", () => ({
  audioFeaturesRepository: {
    findById: vi.fn(),
    findManyByIds: vi.fn(),
  },
  CURRENT_ALGORITHM_VERSION: 1,
}));

vi.mock("@/db/repositories/stats.repository", () => ({
  statsRepository: {
    findAllEvents: vi.fn(),
  },
}));

// buildSessions читает db.listenEvents напрямую
vi.mock("@/db", () => ({
  db: {
    listenEvents: {
      where: vi.fn().mockReturnThis(),
      aboveOrEqual: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { trackRepository } = await import("@/db/repositories");
const { audioFeaturesRepository } = await import("@/db/repositories/audioFeatures.repository");
const { statsRepository } = await import("@/db/repositories/stats.repository");

const mockFindAllIds = trackRepository.findAllIds as ReturnType<typeof vi.fn>;
const mockFindByIds = trackRepository.findByIds as ReturnType<typeof vi.fn>;
const mockFindById = audioFeaturesRepository.findById as ReturnType<typeof vi.fn>;
const mockFindManyByIds = audioFeaturesRepository.findManyByIds as ReturnType<typeof vi.fn>;
const mockFindAllEvents = statsRepository.findAllEvents as ReturnType<typeof vi.fn>;

// ── toVector ───────────────────────────────────────────────────────────────

describe("toVector", () => {
  it("normalizes bpm by dividing by 250", () => {
    expect(toVector(makeFeatures("A", { bpm: 125 })).bpm).toBeCloseTo(0.5, 5);
  });

  it("clamps bpm above 250 to 1.0", () => {
    expect(toVector(makeFeatures("A", { bpm: 300 })).bpm).toBe(1.0);
  });

  it("normalizes spectralCentroid by dividing by 8000", () => {
    expect(toVector(makeFeatures("A", { spectralCentroid: 4000 })).spectralCentroid).toBeCloseTo(0.5, 5);
  });

  it("normalizes key by dividing by 11", () => {
    expect(toVector(makeFeatures("A", { key: 11 })).key).toBeCloseTo(1.0, 5);
  });

  it("passes energy, danceability, mode through unchanged", () => {
    const v = toVector(makeFeatures("A", { energy: 0.8, danceability: 0.6, mode: 0 }));
    expect(v.energy).toBe(0.8);
    expect(v.danceability).toBe(0.6);
    expect(v.mode).toBe(0);
  });
});

// ── getRecommendations ─────────────────────────────────────────────────────

describe("getRecommendations", () => {
  beforeEach(() => {
    mockFindAllIds.mockResolvedValue(ok([]));
    mockFindByIds.mockResolvedValue(ok([]));
    mockFindById.mockResolvedValue(ok(undefined));
    mockFindManyByIds.mockResolvedValue(ok([]));
    mockFindAllEvents.mockResolvedValue(ok([]));
  });

  it("returns empty array when library has no tracks", async () => {
    expect(await getRecommendations(tid("source"))).toEqual([]);
  });

  it("returns empty array when findAllIds fails", async () => {
    mockFindAllIds.mockResolvedValue(err(new Error("DB error")));
    expect(await getRecommendations(tid("source"))).toEqual([]);
  });

  it("excludes sourceTrackId from results", async () => {
    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("other")]));
    mockFindByIds.mockResolvedValue(ok([makeTrack("other")]));

    const result = await getRecommendations(tid("source"));
    expect(result.every(r => r.trackId !== tid("source"))).toBe(true);
  });

  it("excludes the 5 most recently played tracks", async () => {
    const now = Date.now();
    const recent = ["r1", "r2", "r3", "r4", "r5"];
    // Каждый recent трек имеет уникальный startedAt чтобы правильно взяться top-5
    const recentEvents = recent.map((id, i) =>
      makeEvent(id, { startedAt: now - (i + 1) * 60_000 }),
    );

    mockFindAllIds.mockResolvedValue(
      ok(["source", ...recent, "safe"].map(tid)),
    );
    // findByIds вернёт только "safe" (recent треки исключены до вызова findByIds)
    mockFindByIds.mockImplementation((ids: TrackId[]) =>
      Promise.resolve(ok(ids.map(id => makeTrack(String(id))))),
    );
    // findAllEvents вызывается ДВАЖДЫ: в getRecentlyPlayedIds и в самом getRecommendations
    mockFindAllEvents.mockResolvedValue(ok(recentEvents));

    const result = await getRecommendations(tid("source"), 10);
    const resultIds = result.map(r => r.trackId);
    recent.forEach(id => expect(resultIds).not.toContain(tid(id)));
  });

  it("respects limit parameter", async () => {
    const tracks = Array.from({ length: 20 }, (_, i) => makeTrack(`t${i}`));
    mockFindAllIds.mockResolvedValue(ok(tracks.map(t => t.id)));
    mockFindByIds.mockResolvedValue(ok(tracks));

    const result = await getRecommendations(tid("source"), 5);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("scores liked tracks higher than non-liked", async () => {
    const liked = makeTrack("liked", { likedAt: Date.now() });
    const notLiked = makeTrack("not-liked");

    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("liked"), tid("not-liked")]));
    mockFindByIds.mockResolvedValue(ok([liked, notLiked]));

    const result = await getRecommendations(tid("source"));
    const likedRes = result.find(r => r.trackId === tid("liked"))!;
    const notLikedRes = result.find(r => r.trackId === tid("not-liked"))!;

    expect(likedRes.score).toBeGreaterThan(notLikedRes.score);
    expect(likedRes.breakdown.likedBonus).toBe(1.0);
    expect(notLikedRes.breakdown.likedBonus).toBe(0.0);
  });

  it("scores tracks with higher completionRate above lower completionRate", async () => {
    const OLD = Date.now() - 60 * 24 * 60 * 60_000; // 60 дней назад
    const NOW = Date.now();

    const trackA = makeTrack("A");
    const trackB = makeTrack("B");
    const fillerIds = ["f1", "f2", "f3", "f4", "f5"];

    // 5 filler-треков с недавними событиями — они вытеснят A/B из top-5 recent
    const fillerEvents = fillerIds.map((id, i) =>
      makeEvent(id, { startedAt: NOW - i * 60_000 }),
    );

    mockFindAllIds.mockResolvedValue(
      ok([tid("source"), ...fillerIds.map(tid), tid("A"), tid("B")]),
    );
    mockFindByIds.mockImplementation((ids: TrackId[]) =>
      Promise.resolve(ok(ids.map(id => makeTrack(String(id))))),
    );

    mockFindAllEvents.mockResolvedValue(ok([
      ...fillerEvents,
      makeEvent("A", { completed: true, startedAt: OLD }),
      makeEvent("B", { completed: false, startedAt: OLD - 1000 }),
    ]));

    const result = await getRecommendations(tid("source"));
    const aRes = result.find(r => r.trackId === tid("A"))!;
    const bRes = result.find(r => r.trackId === tid("B"))!;

    expect(aRes).toBeDefined();
    expect(bRes).toBeDefined();
    expect(aRes.breakdown.completionRate).toBe(1.0);
    expect(bRes.breakdown.completionRate).toBe(0.0);
    expect(aRes.score).toBeGreaterThan(bRes.score);
  });

  it("uses prior 0.5 for tracks with no events", async () => {
    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("new")]));
    mockFindByIds.mockResolvedValue(ok([makeTrack("new")]));

    const result = await getRecommendations(tid("source"));
    expect(result[0].breakdown.completionRate).toBe(0.5);
  });

  it("gives exploration bonus 0.6 to never-played tracks", async () => {
    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("never")]));
    mockFindByIds.mockResolvedValue(ok([makeTrack("never")])); // no lastPlayedAt

    const result = await getRecommendations(tid("source"));
    expect(result[0].breakdown.recencyScore).toBe(0.6);
  });

  it("tracks with audio features get non-zero audioSimilarity", async () => {
    const sourceFeatures = makeFeatures("source", { bpm: 120, energy: 0.5, key: 5 });
    const candidateFeatures = makeFeatures("with-features", { bpm: 122, energy: 0.52, key: 5 });

    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("with-features"), tid("no-features")]));
    mockFindByIds.mockResolvedValue(ok([makeTrack("with-features"), makeTrack("no-features")]));
    mockFindById.mockResolvedValue(ok(sourceFeatures));
    mockFindManyByIds.mockResolvedValue(ok([candidateFeatures]));

    const result = await getRecommendations(tid("source"));
    const withFeat = result.find(r => r.trackId === tid("with-features"))!;
    const noFeat = result.find(r => r.trackId === tid("no-features"))!;

    expect(withFeat.breakdown.audioSimilarity).toBeGreaterThan(0);
    expect(noFeat.breakdown.audioSimilarity).toBe(0);
  });

  it("audioSimilarity is 0 when source has no features", async () => {
    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("A")]));
    mockFindByIds.mockResolvedValue(ok([makeTrack("A")]));
    mockFindById.mockResolvedValue(ok(undefined)); // нет фич у source
    mockFindManyByIds.mockResolvedValue(ok([makeFeatures("A")]));

    const result = await getRecommendations(tid("source"));
    expect(result[0].breakdown.audioSimilarity).toBe(0);
  });

  it("results are sorted by score descending", async () => {
    const liked = makeTrack("liked", { likedAt: Date.now() });
    const notLiked = makeTrack("not-liked");

    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("liked"), tid("not-liked")]));
    mockFindByIds.mockResolvedValue(ok([liked, notLiked]));

    const result = await getRecommendations(tid("source"));
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it("returns empty array when candidateTracksResult is Err", async () => {
    mockFindAllIds.mockResolvedValue(ok([tid("source"), tid("A")]));
    mockFindByIds.mockResolvedValue(err(new Error("DB read failed")));

    expect(await getRecommendations(tid("source"))).toEqual([]);
  });

  it("all breakdown values are in [0, 1] range", async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => makeTrack(`t${i}`));
    const features = tracks.map((t, i) => makeFeatures(t.id, { bpm: 80 + i * 10, energy: 0.3 + i * 0.1 }));

    mockFindAllIds.mockResolvedValue(ok([tid("source"), ...tracks.map(t => t.id)]));
    mockFindByIds.mockResolvedValue(ok(tracks));
    mockFindById.mockResolvedValue(ok(makeFeatures("source")));
    mockFindManyByIds.mockResolvedValue(ok(features));

    const result = await getRecommendations(tid("source"));
    for (const r of result) {
      for (const [key, val] of Object.entries(r.breakdown)) {
        expect(val, `${key} out of [0,1]`).toBeGreaterThanOrEqual(0);
        expect(val, `${key} out of [0,1]`).toBeLessThanOrEqual(1);
      }
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
