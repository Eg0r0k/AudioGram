import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SearchIndexModule from "../searchIndex";
import type { SearchDocument, SearchResultItem, WorkerRequest, WorkerResponse } from "../types";
import { ok } from "neverthrow";
import { TrackSource, TrackState } from "@/db/entities";

type WorkerListener = (event: unknown) => void;

const { FakeWorker, buildAllSearchDocuments, repositories } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    posted: unknown[] = [];
    terminated = false;
    private listeners = new Map<string, Set<(event: unknown) => void>>();

    constructor() {
      FakeWorker.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void): void {
      let set = this.listeners.get(type);
      if (!set) {
        set = new Set();
        this.listeners.set(type, set);
      }
      set.add(listener);
    }

    removeEventListener(type: string, listener: (event: unknown) => void): void {
      this.listeners.get(type)?.delete(listener);
    }

    postMessage(msg: unknown): void {
      this.posted.push(msg);
    }

    terminate(): void {
      this.terminated = true;
    }

    emit(type: string, event: unknown): void {
      for (const listener of [...(this.listeners.get(type) ?? [])]) {
        listener(event);
      }
    }
  }

  const repositories = {
    trackRepository: { findByIds: vi.fn() },
    artistRepository: { findByIds: vi.fn() },
    albumRepository: { findByIds: vi.fn() },
  };

  return { FakeWorker, buildAllSearchDocuments: vi.fn(), repositories };
});

vi.mock("../search.worker?worker", () => ({ default: FakeWorker }));
vi.mock("../buildDocuments", () => ({ buildAllSearchDocuments }));
vi.mock("@/db/repositories", () => repositories);
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

let searchIndex: typeof SearchIndexModule;

function emitToWorker(worker: InstanceType<typeof FakeWorker>, msg: WorkerResponse): void {
  worker.emit("message", { data: msg });
}

function isSearchRequest(msg: unknown): msg is Extract<WorkerRequest, { action: "search" }> {
  return typeof msg === "object" && msg !== null && "action" in msg && msg.action === "search";
}

async function initIndex(): Promise<InstanceType<typeof FakeWorker>> {
  const ready = searchIndex.initSearchIndex();
  await vi.waitFor(() => {
    expect(FakeWorker.instances.length).toBeGreaterThan(0);
    const worker = FakeWorker.instances.at(-1);
    expect(worker?.posted.length).toBeGreaterThan(0);
  });
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error("no worker spawned");
  emitToWorker(worker, { action: "ready", count: 0 });
  await ready;
  return worker;
}

async function answerNextSearch(worker: InstanceType<typeof FakeWorker>): Promise<void> {
  await vi.waitFor(() => {
    expect(worker.posted.some(isSearchRequest)).toBe(true);
  });
  const request = worker.posted.find(isSearchRequest);
  if (!request) throw new Error("no search request posted");
  emitToWorker(worker, {
    action: "results",
    results: [],
    id: request.id,
    total: 0,
    totalDuration: 0,
  });
}

const someDoc: SearchDocument = {
  id: "track:t1",
  type: "track",
  title: "Alpha Song",
  artist: "Some Artist",
  entityId: "t1",
};

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  FakeWorker.instances.length = 0;
  buildAllSearchDocuments.mockReset().mockResolvedValue([]);
  vi.resetModules();
  // Dynamic import on purpose: searchIndex holds module-level client state
  // that must be recreated per test via vi.resetModules().
  searchIndex = await import("../searchIndex");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("searchIndex worker error swallowing", () => {
  it("discards the client after an id-less worker error and rebuilds on next search", async () => {
    const worker = await initIndex();

    await searchIndex.upsertSearchDocuments([someDoc]);
    // Worker-side failure of the fire-and-forget add: error carries no id.
    emitToWorker(worker, { action: "error", message: "cannot discard document" });

    const search = searchIndex.searchDocuments("alpha", "all");
    await vi.waitFor(() => {
      expect(FakeWorker.instances.length).toBe(2);
    });
    expect(worker.terminated).toBe(true);

    const second = FakeWorker.instances[1];
    await vi.waitFor(() => {
      expect(second.posted.length).toBeGreaterThan(0);
    });
    emitToWorker(second, { action: "ready", count: 0 });
    await answerNextSearch(second);

    await expect(search).resolves.toEqual({ results: [], total: 0, totalDuration: 0 });
    expect(buildAllSearchDocuments).toHaveBeenCalledTimes(2);
  });
});

describe("searchIndex worker lifecycle", () => {
  it("spawns a fresh worker after a worker error event", async () => {
    const worker = await initIndex();

    worker.emit("error", new Event("error"));

    const search = searchIndex.searchDocuments("beta", "all");
    await vi.waitFor(() => {
      expect(FakeWorker.instances.length).toBe(2);
    });
    expect(worker.terminated).toBe(true);

    const second = FakeWorker.instances[1];
    await vi.waitFor(() => {
      expect(second.posted.length).toBeGreaterThan(0);
    });
    emitToWorker(second, { action: "ready", count: 0 });
    await answerNextSearch(second);
    await expect(search).resolves.toEqual({ results: [], total: 0, totalDuration: 0 });
  });

  it("rejects an in-flight search when the worker errors", async () => {
    const worker = await initIndex();

    const pending = searchIndex.searchDocuments("query", "all");
    await vi.waitFor(() => {
      expect(worker.posted.some(isSearchRequest)).toBe(true);
    });

    let settled = false;
    pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    worker.emit("error", new Event("error"));

    await vi.waitFor(() => {
      expect(settled).toBe(true);
    });
    await expect(pending).rejects.toThrow();
  });

  it("times out a search when the worker never responds", async () => {
    const worker = await initIndex();
    expect(worker.terminated).toBe(false);

    vi.useFakeTimers();
    const pending = searchIndex.searchDocuments("query", "all");

    let settled = false;
    pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );

    await vi.advanceTimersByTimeAsync(30_001);
    expect(settled).toBe(true);
    await expect(pending).rejects.toThrow(/timed out/i);
    vi.useRealTimers();

    // A wedged worker is poisoned: the next search starts over on a new one.
    const search = searchIndex.searchDocuments("again", "all");
    await vi.waitFor(() => {
      expect(FakeWorker.instances.length).toBe(2);
    });
    const second = FakeWorker.instances[1];
    await vi.waitFor(() => {
      expect(second.posted.length).toBeGreaterThan(0);
    });
    emitToWorker(second, { action: "ready", count: 0 });
    await answerNextSearch(second);
    await expect(search).resolves.toEqual({ results: [], total: 0, totalDuration: 0 });
  });
});

describe("resetSearchIndex", () => {
  it("discards the live index; the next search rebuilds from scratch", async () => {
    const worker = await initIndex();

    searchIndex.resetSearchIndex();
    expect(worker.terminated).toBe(true);

    const search = searchIndex.searchDocuments("anything", "all");
    await vi.waitFor(() => {
      expect(FakeWorker.instances.length).toBe(2);
    });
    const second = FakeWorker.instances[1];
    await vi.waitFor(() => {
      expect(second.posted.length).toBeGreaterThan(0);
    });
    emitToWorker(second, { action: "ready", count: 0 });
    await answerNextSearch(second);

    await expect(search).resolves.toEqual({ results: [], total: 0, totalDuration: 0 });
    expect(buildAllSearchDocuments).toHaveBeenCalledTimes(2);
  });
});

describe("searchTracks hydration by id", () => {
  it("plays the DB storagePath, not the frozen storagePath embedded in the index", async () => {
    // The indexed document is stale: its embedded payload points at an old path
    // (e.g. after a folder relink, or a REMOTE_HLS URL whose TTL expired).
    const staleResults = [{
      id: "track:t1",
      type: "track",
      title: "Alpha Song",
      artist: "Old Artist",
      album: "Old Album",
      entityId: "t1",
      score: 1,
      duration: 100,
      // Legacy frozen payload that MUST NOT be used for playback:
      track: {
        kind: "library",
        id: "t1",
        title: "Alpha Song",
        artist: "Old Artist",
        artistIds: [],
        albumId: "al1",
        albumName: "Old Album",
        storagePath: "STALE/old.mp3",
        source: TrackSource.LOCAL_INTERNAL,
        state: TrackState.READY,
        duration: 100,
        isLiked: false,
        playCount: 0,
        addedAt: 1,
      },
    }] as unknown as SearchResultItem[];

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

    const worker = await initIndex();
    const search = searchIndex.searchTracks("alpha", 0, undefined);

    await vi.waitFor(() => {
      expect(worker.posted.some(isSearchRequest)).toBe(true);
    });
    const request = worker.posted.find(isSearchRequest);
    if (!request) throw new Error("no search request posted");
    emitToWorker(worker, {
      action: "results",
      results: staleResults,
      id: request.id,
      total: 1,
      totalDuration: 100,
    });

    const { tracks } = await search;

    expect(tracks).toHaveLength(1);
    expect(tracks[0].id).toBe("t1");
    // The invariant: entity hydrated by id, so the path is current, not the frozen one.
    expect(tracks[0].storagePath).toBe("CURRENT/real.mp3");
    expect(repositories.trackRepository.findByIds).toHaveBeenCalledWith(["t1"]);
  });
});
