import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SearchIndexModule from "../service/searchIndex";
import type { SearchDocument } from "../types";
import { ok } from "neverthrow";
import { TrackSource, TrackState } from "@/db/entities";

const { buildAllSearchDocuments, repositories } = vi.hoisted(() => ({
  buildAllSearchDocuments: vi.fn(),
  repositories: {
    trackRepository: { findByIds: vi.fn() },
    artistRepository: { findByIds: vi.fn() },
    albumRepository: { findByIds: vi.fn() },
  },
}));

vi.mock("../service/buildDocuments", () => ({ buildAllSearchDocuments }));
vi.mock("@/db/repositories", () => repositories);
vi.mock("@/db", () => ({ db: { tracks: { where: () => ({ equals: () => ({ count: async () => 0 }) }) } } }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

let searchIndex: typeof SearchIndexModule;

const alphaDoc: SearchDocument = {
  id: "track:t1",
  type: "track",
  title: "Alpha Song",
  artist: "Some Artist",
  entityId: "t1",
  duration: 100,
};

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  buildAllSearchDocuments.mockReset().mockResolvedValue([]);
  vi.resetModules();
  // Dynamic import on purpose: the module holds the live index, recreated per test.
  searchIndex = await import("../service/searchIndex");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("searchIndex lifecycle", () => {
  it("builds once and serves later searches from the same index", async () => {
    buildAllSearchDocuments.mockResolvedValue([alphaDoc]);

    const first = await searchIndex.searchDocuments("alpha", "all");
    const second = await searchIndex.searchDocuments("alpha", "track");

    expect(first.results.map(r => r.entityId)).toEqual(["t1"]);
    expect(second.total).toBe(1);
    expect(buildAllSearchDocuments).toHaveBeenCalledTimes(1);
  });

  it("resetSearchIndex discards the index; the next search rebuilds from scratch", async () => {
    await searchIndex.initSearchIndex();

    searchIndex.resetSearchIndex();
    buildAllSearchDocuments.mockResolvedValue([alphaDoc]);
    const response = await searchIndex.searchDocuments("alpha", "all");

    expect(response.total).toBe(1);
    expect(buildAllSearchDocuments).toHaveBeenCalledTimes(2);
  });

  it("retries the build after a failed one instead of caching the failure", async () => {
    buildAllSearchDocuments.mockRejectedValueOnce(new Error("db closed"));

    await expect(searchIndex.initSearchIndex()).rejects.toThrow("db closed");

    buildAllSearchDocuments.mockResolvedValue([alphaDoc]);
    await expect(searchIndex.searchDocuments("alpha", "all")).resolves.toMatchObject({ total: 1 });
  });
});

describe("searchIndex mutations", () => {
  it("upserted documents are searchable and removed ones are not", async () => {
    await searchIndex.upsertSearchDocuments([alphaDoc]);
    expect((await searchIndex.searchDocuments("alpha", "all")).total).toBe(1);

    await searchIndex.removeSearchDocuments(["track:t1"]);
    expect((await searchIndex.searchDocuments("alpha", "all")).total).toBe(0);
  });
});

describe("searchTracks hydration by id", () => {
  it("plays the DB storagePath, not anything embedded in the index", async () => {
    buildAllSearchDocuments.mockResolvedValue([alphaDoc]);
    repositories.trackRepository.findByIds.mockResolvedValue(ok([{
      id: "t1",
      title: "Alpha Song",
      artistIds: [],
      artistName: "Real Artist",
      albumId: "al1",
      albumTitle: "Real Album",
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "CURRENT/real.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
    }]));
    repositories.artistRepository.findByIds.mockResolvedValue(ok([]));
    repositories.albumRepository.findByIds.mockResolvedValue(ok([
      { id: "al1", title: "Real Album", artistId: "a0", addedAt: 1, updatedAt: 1 },
    ]));

    const { tracks, total, totalDuration } = await searchIndex.searchTracks("alpha", 0, undefined);

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("t1");
    expect(tracks[0].storagePath).toBe("CURRENT/real.mp3");
    expect(total).toBe(1);
    expect(totalDuration).toBe(100);
    expect(repositories.trackRepository.findByIds).toHaveBeenCalledWith(["t1"]);
  });
});
