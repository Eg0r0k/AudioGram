import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, nextTick } from "vue";
import { errAsync, ok, okAsync } from "neverthrow";
import { TrackId } from "@/types/ids";
import { ndTrackId, ytTrackId } from "@/types/track-ref";
import type { PlayerTrack } from "../../types";

const platformCapsMock = vi.hoisted(() => ({ canProxyStream: true }));
const findByIdMock = vi.hoisted(() => vi.fn());
const trackFindByIdMock = vi.hoisted(() => vi.fn());
const getAudioUrlMock = vi.hoisted(() => vi.fn());
const sourcesGetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/environment/platformCaps", () => ({ platformCaps: platformCapsMock }));
vi.mock("@/db/repositories", () => ({
  offlineCopyRepository: { findById: findByIdMock },
  trackRepository: { findById: trackFindByIdMock },
}));
vi.mock("@/db/storage", () => ({
  storageService: { getAudioUrl: getAudioUrlMock },
}));
vi.mock("@/modules/sources/registry", () => ({
  sources: { get: sourcesGetMock },
}));

const queueMock = reactive({
  queue: [] as { track: PlayerTrack }[],
  currentIndex: -1,
  repeatMode: "off" as "off" | "all" | "one",
  get size() {
    return this.queue.length;
  },
  ensureAutoplayRecommendations: vi.fn(async () => true),
});
const playerMock = reactive({
  isPlaying: false,
});

vi.mock("@/modules/queue/store/queue.store", () => ({ useQueueStore: () => queueMock }));
vi.mock("../../store/player.store", () => ({ usePlayerStore: () => playerMock }));

import {
  createNextTrackPrefetcher,
  initNextTrackPrefetch,
  nextPlaybackIndex,
  prefetchIdOf,
  warmLocalTranscode,
} from "../prefetch-next";

const libraryTrack = (id: string, storagePath?: string): PlayerTrack =>
  ({ kind: "library", id, storagePath } as unknown as PlayerTrack);

const ephemeralUrlTrack = (url: string): PlayerTrack =>
  ({ kind: "ephemeral", id: url, source: { type: "url", url } } as unknown as PlayerTrack);

describe("nextPlaybackIndex", () => {
  it("returns the following index mid-queue", () => {
    expect(nextPlaybackIndex(0, 3, "off")).toBe(1);
  });

  it("returns the first index before playback starts (restored queue)", () => {
    expect(nextPlaybackIndex(-1, 3, "off")).toBe(0);
  });

  it("returns null at the last index with repeat off", () => {
    expect(nextPlaybackIndex(2, 3, "off")).toBeNull();
  });

  it("wraps to the first index at the end under repeat-all", () => {
    expect(nextPlaybackIndex(2, 3, "all")).toBe(0);
  });

  it("returns null for a single-track repeat-all loop (already playing)", () => {
    expect(nextPlaybackIndex(0, 1, "all")).toBeNull();
  });

  it("returns null under repeat-one — next() replays the current track", () => {
    expect(nextPlaybackIndex(0, 3, "one")).toBeNull();
  });

  it("returns null for an empty queue", () => {
    expect(nextPlaybackIndex(-1, 0, "off")).toBeNull();
  });
});

describe("prefetchIdOf", () => {
  it("passes remote library ids through — including library-pinned YT tracks", () => {
    expect(prefetchIdOf(libraryTrack("nd:s1"))).toBe("nd:s1");
    expect(prefetchIdOf(libraryTrack("yt:dQw4w9WgXcQ"))).toBe("yt:dQw4w9WgXcQ");
  });

  it("skips local library tracks the webview plays natively", () => {
    expect(prefetchIdOf(libraryTrack("3f0a2f8e-uuid"))).toBeNull();
    expect(prefetchIdOf(libraryTrack("3f0a2f8e-uuid", "tracks/a.mp3"))).toBeNull();
    expect(prefetchIdOf(libraryTrack("3f0a2f8e-uuid", "tracks/a.flac"))).toBeNull();
  });

  it("passes local transcode candidates through — their first request pays a decode", () => {
    expect(prefetchIdOf(libraryTrack("3f0a2f8e-uuid", "tracks/a.ape"))).toBe("3f0a2f8e-uuid");
    expect(prefetchIdOf(libraryTrack("3f0a2f8e-uuid", "tracks/a.m4a"))).toBe("3f0a2f8e-uuid");
  });

  it("rebuilds a yt: id from an ephemeral proxied track", () => {
    const track = ephemeralUrlTrack("http://127.0.0.1:60123/deadbeef/yt/dQw4w9WgXcQ");
    expect(prefetchIdOf(track)).toBe(ytTrackId("dQw4w9WgXcQ"));
  });

  it("skips ephemeral non-yt urls (radio) and non-url sources", () => {
    expect(prefetchIdOf(ephemeralUrlTrack("https://radio.example/live.m3u8"))).toBeNull();
    expect(prefetchIdOf({ kind: "ephemeral", source: { type: "path", path: "C:/a.mp3" } } as unknown as PlayerTrack)).toBeNull();
    expect(prefetchIdOf(null)).toBeNull();
    expect(prefetchIdOf(undefined)).toBeNull();
  });
});

describe("warmLocalTranscode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a 2-byte range of the resolved audio url to warm the server cache", async () => {
    trackFindByIdMock.mockReturnValue(okAsync({ storagePath: "tracks/a.ape" }));
    getAudioUrlMock.mockReturnValue(okAsync("http://127.0.0.1:1/t/local/a.ape"));
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await warmLocalTranscode(TrackId("uuid-1"));

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:1/t/local/a.ape",
      { headers: { Range: "bytes=0-1" } },
    );
  });

  it("reports a missing track or a failing server without throwing", async () => {
    trackFindByIdMock.mockReturnValue(okAsync(undefined));
    expect((await warmLocalTranscode(TrackId("uuid-1"))).ok).toBe(false);

    trackFindByIdMock.mockReturnValue(okAsync({ storagePath: "tracks/a.ape" }));
    getAudioUrlMock.mockReturnValue(okAsync("http://127.0.0.1:1/t/local/a.ape"));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500 })));

    expect(await warmLocalTranscode(TrackId("uuid-1"))).toEqual({ ok: false, error: "HTTP 500" });
  });
});

describe("createNextTrackPrefetcher", () => {
  const DEBOUNCE = 3000;
  const TTL = 30_000;

  const makeDeps = () => ({
    nextTrackId: vi.fn<() => TrackId | null>(() => TrackId("yt:abc")),
    hasOfflineCopy: vi.fn(async () => false),
    prefetch: vi.fn<(id: TrackId) => Promise<{ ok: boolean; error?: string }> | null>(
      () => Promise.resolve({ ok: true }),
    ),
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid schedules into one run against the target at fire time", async () => {
    const deps = makeDeps();
    deps.nextTrackId
      .mockReturnValueOnce(TrackId("yt:final"));
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
    prefetcher.schedule();
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    // The target is read once, when the settled timer fires — not captured
    // per schedule() call.
    expect(deps.nextTrackId).toHaveBeenCalledTimes(1);
    expect(deps.prefetch).toHaveBeenCalledTimes(1);
    expect(deps.prefetch).toHaveBeenCalledWith("yt:final");
  });

  it("does nothing when no upcoming track needs warming", async () => {
    const deps = makeDeps();
    deps.nextTrackId.mockReturnValue(null);
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(deps.prefetch).not.toHaveBeenCalled();
  });

  it("skips tracks that already have an offline copy", async () => {
    const deps = makeDeps();
    deps.hasOfflineCopy.mockResolvedValue(true);
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(deps.prefetch).not.toHaveBeenCalled();
  });

  it("dedupes a recently successful prefetch, but re-warms after the TTL", async () => {
    const deps = makeDeps();
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(deps.prefetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TTL);
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(deps.prefetch).toHaveBeenCalledTimes(2);
  });

  it("retries a failed prefetch on the next trigger", async () => {
    const deps = makeDeps();
    deps.prefetch.mockResolvedValueOnce({ ok: false, error: "[NETWORK] down" });
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(deps.prefetch).toHaveBeenCalledTimes(2);
  });

  it("does not start a second request for an id already in flight", async () => {
    const deps = makeDeps();
    let release!: (value: { ok: boolean }) => void;
    deps.prefetch.mockReturnValueOnce(new Promise((resolve) => {
      release = resolve;
    }));
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(deps.prefetch).toHaveBeenCalledTimes(1);

    release({ ok: true });
  });

  it("stays quiet when the source cannot prefetch (unavailable / unsupported)", async () => {
    const deps = makeDeps();
    deps.prefetch.mockReturnValue(null);
    const prefetcher = createNextTrackPrefetcher(deps);

    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);

    expect(deps.prefetch).toHaveBeenCalledTimes(1);
    // No success memo: the next trigger tries again.
    prefetcher.schedule();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
    expect(deps.prefetch).toHaveBeenCalledTimes(2);
  });
});

describe("initNextTrackPrefetch", () => {
  const DEBOUNCE = 3000;
  const provider = {
    isAvailable: true,
    prefetch: vi.fn(() => okAsync<void, { kind: string; message: string }>(undefined)),
  };
  let dispose: (() => void) | null = null;

  const init = () => {
    dispose = initNextTrackPrefetch();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    platformCapsMock.canProxyStream = true;
    findByIdMock.mockResolvedValue(ok(undefined));
    sourcesGetMock.mockReturnValue(provider);
    provider.isAvailable = true;
    queueMock.queue = [];
    queueMock.currentIndex = -1;
    queueMock.repeatMode = "off";
    playerMock.isPlaying = false;
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.useRealTimers();
  });

  const settle = async () => {
    await nextTick();
    await vi.advanceTimersByTimeAsync(DEBOUNCE);
  };

  it("tops up autoplay recommendations while the tail track plays, not after it ends", async () => {
    queueMock.queue = [{ track: libraryTrack("local-uuid") }];
    queueMock.currentIndex = 0;

    init();
    await nextTick();
    expect(queueMock.ensureAutoplayRecommendations).not.toHaveBeenCalled();

    playerMock.isPlaying = true;
    await nextTick();
    expect(queueMock.ensureAutoplayRecommendations).toHaveBeenCalledTimes(1);
  });

  it("does not top up recommendations mid-queue or under repeat", async () => {
    queueMock.queue = [
      { track: libraryTrack("local-a") },
      { track: libraryTrack("local-b") },
    ];
    queueMock.currentIndex = 0;
    playerMock.isPlaying = true;

    init();
    await nextTick();
    expect(queueMock.ensureAutoplayRecommendations).not.toHaveBeenCalled();

    queueMock.currentIndex = 1;
    queueMock.repeatMode = "all";
    await nextTick();
    expect(queueMock.ensureAutoplayRecommendations).not.toHaveBeenCalled();
  });

  it("warms a library-pinned YT track following a local one (the missed case)", async () => {
    queueMock.queue = [
      { track: libraryTrack("local-uuid") },
      { track: libraryTrack("yt:dQw4w9WgXcQ") },
    ];
    queueMock.currentIndex = 0;

    init();
    await settle();

    expect(provider.prefetch).toHaveBeenCalledWith("yt:dQw4w9WgXcQ");
  });

  it("re-targets when the queue advances", async () => {
    queueMock.queue = [
      { track: libraryTrack("nd:s1") },
      { track: libraryTrack("nd:s2") },
      { track: libraryTrack("nd:s3") },
    ];
    queueMock.currentIndex = 0;

    init();
    await settle();
    expect(provider.prefetch).toHaveBeenLastCalledWith(ndTrackId("s2"));

    queueMock.currentIndex = 1;
    await settle();
    expect(provider.prefetch).toHaveBeenLastCalledWith(ndTrackId("s3"));
  });

  it("re-targets on queue mutations that change the upcoming track", async () => {
    const s2 = { track: libraryTrack("nd:s2") };
    const s3 = { track: libraryTrack("nd:s3") };
    queueMock.queue = [{ track: libraryTrack("nd:s1") }, s2, s3];
    queueMock.currentIndex = 0;

    init();
    await settle();
    expect(provider.prefetch).toHaveBeenLastCalledWith(ndTrackId("s2"));

    // A reorder swaps what plays next — the watcher must pick it up without
    // any track change.
    queueMock.queue = [queueMock.queue[0], s3, s2];
    await settle();
    expect(provider.prefetch).toHaveBeenLastCalledWith(ndTrackId("s3"));
  });

  it("warms the wrap-around target when repeat-all turns on at the queue end", async () => {
    queueMock.queue = [
      { track: libraryTrack("nd:first") },
      { track: libraryTrack("nd:last") },
    ];
    queueMock.currentIndex = 1;

    init();
    await settle();
    expect(provider.prefetch).not.toHaveBeenCalled();

    queueMock.repeatMode = "all";
    await settle();
    expect(provider.prefetch).toHaveBeenCalledWith(ndTrackId("first"));
  });

  it("does not warm anything under repeat-one", async () => {
    queueMock.queue = [
      { track: libraryTrack("nd:s1") },
      { track: libraryTrack("nd:s2") },
    ];
    queueMock.currentIndex = 0;
    queueMock.repeatMode = "one";

    init();
    await settle();

    expect(provider.prefetch).not.toHaveBeenCalled();
  });

  it("skips providers that are currently unavailable and surfaces failures as non-fatal", async () => {
    queueMock.queue = [
      { track: libraryTrack("nd:s1") },
      { track: libraryTrack("nd:s2") },
    ];
    queueMock.currentIndex = 0;
    provider.isAvailable = false;

    init();
    await settle();
    expect(provider.prefetch).not.toHaveBeenCalled();

    provider.isAvailable = true;
    provider.prefetch.mockReturnValueOnce(errAsync({ kind: "NETWORK", message: "down" }));
    queueMock.currentIndex = -1;
    await settle();
    expect(provider.prefetch).toHaveBeenCalledWith(ndTrackId("s1"));
  });

  it("does nothing on platforms without the stream proxy", async () => {
    platformCapsMock.canProxyStream = false;
    queueMock.queue = [
      { track: libraryTrack("nd:s1") },
      { track: libraryTrack("nd:s2") },
    ];
    queueMock.currentIndex = 0;

    init();
    await settle();

    expect(provider.prefetch).not.toHaveBeenCalled();
  });
});
