import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "../types";
import { nextTick } from "vue";

let mockPlayer: Record<string, unknown>;
const mockPlayerMethods = {
  dispose: vi.fn().mockResolvedValue(undefined),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  setPlaybackRate: vi.fn(),
  toggleMute: vi.fn(),
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  seekPercent: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  fadeIn: vi.fn().mockResolvedValue(undefined),
  fadeOut: vi.fn().mockResolvedValue(undefined),
  fadeTo: vi.fn().mockResolvedValue(undefined),
  cancelFade: vi.fn(),
  clearLoudnessMetadata: vi.fn(),
  setLoudnessMetadata: vi.fn(),
  unlockAudio: vi.fn().mockResolvedValue(undefined),
};

vi.mock("lyra-audio", () => {
  let _on: Record<string, ((...args: unknown[]) => void)[]> = {};

  function MockPlayer() {
    const instance = {
      ...mockPlayerMethods,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!_on[event]) _on[event] = [];
        _on[event].push(handler);
      }),
      trigger: (event: string, ...args: unknown[]) => {
        (_on[event] ?? []).forEach(h => h(...args));
      },
      resetListeners: () => { _on = {}; },
      get isReady() { return true; },
      get isPlaying() { return false; },
      get duration() { return 0; },
      get currentTime() { return 0; },
      get graph() { return null; },
    };
    mockPlayer = instance;
    return instance;
  }
  MockPlayer.prototype = Object.create(null);

  return { Player: MockPlayer };
});

vi.mock("hls.js", () => ({ default: class MockHls {} }));

const audioSettingsDefaults = {
  isNormalizationEnabled: false,
  normalizationTargetLufs: -14,
  normalizationPreventClipping: true,
  isFadeEnabled: false,
  fadeInDuration: 0,
  fadeOutDuration: 0,
};
// Shared mutable settings object so individual tests can flip fade options;
// beforeEach restores the defaults.
const mockAudioSettings = { ...audioSettingsDefaults, pushToGraph: vi.fn() };

vi.mock("@/modules/settings/store/audio", () => ({
  useAudioSettingsStore: () => mockAudioSettings,
}));

const storageMock = vi.hoisted(() => ({
  getAudioUrl: vi.fn(() => okAsync("blob:mock-audio-url")),
}));

vi.mock("@/db/storage", () => ({
  storageService: {
    getAudioUrl: storageMock.getAudioUrl,
    getFile: () => Promise.resolve({ isErr: () => true }),
  },
}));

const offlineCopyMock = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock("@/db/repositories", () => ({
  offlineCopyRepository: offlineCopyMock,
}));

const sourcesMock = vi.hoisted(() => ({ forTrack: vi.fn() }));

vi.mock("@/modules/sources", () => ({ sources: sourcesMock }));

const statsMock = vi.hoisted(() => ({
  stopListening: vi.fn(() => Promise.resolve()),
  startListening: vi.fn(),
}));

vi.mock("@/services/stats.service", () => ({
  statsService: statsMock,
}));

vi.mock("@/queries/client", () => ({
  queryClient: {
    invalidateQueries: () => {},
    removeQueries: () => {},
  },
}));

vi.mock("@/queries/stats.queries", () => ({
  invalidateStatsQueries: () => Promise.resolve(),
}));

vi.mock("../service/lyrics.service", () => ({
  fetchLrcLibLyrics: () => Promise.resolve({ match: (okFn: (v: never[]) => unknown) => okFn([]) }),
}));

vi.mock("@/lib/environment/userAgent", () => ({
  IS_TAURI: false,
}));

const loggerMock = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock("@/lib/logger", () => ({ getLogger: () => loggerMock }));

import { useEventBus } from "@vueuse/core";
import { ok, okAsync, errAsync, ResultAsync } from "neverthrow";
import { usePlayerStore } from "../store/player.store";
import { trackEndedEvent } from "../lib/player-events";
import { PlaybackFailure } from "../service/playback-resolver.service";
import { StorageError, StorageErrorCode } from "@/db/errors/storage.errors";

function createLibraryTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "track-1" as never,
    kind: "library",
    title: "Test Track",
    artist: "Test Artist",
    artistIds: ["artist-1" as never],
    albumId: "album-1" as never,
    albumName: "Test Album",
    storagePath: "/path/to/track.mp3",
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    duration: 200,
    isLiked: false,
    ...overrides,
  };
}

describe("player.store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // The mock Player shares one listener registry across instances; stale
    // handlers from a previous test would otherwise also react to triggers.
    if (mockPlayer) (mockPlayer.resetListeners as () => void)();
    mockPlayer = undefined!;
    Object.assign(mockAudioSettings, audioSettingsDefaults);
  });

  describe("initial state", () => {
    it("should have correct default values", () => {
      const store = usePlayerStore();

      expect(store.volume).toBe(1);
      expect(store.isMuted).toBe(false);
      expect(store.repeatMode).toBe("off");
      expect(store.status).toBe("idle");
      expect(store.currentTrack).toBe(null);
      expect(store.currentTime).toBe(0);
      expect(store.duration).toBe(0);
      expect(store.graphRevision).toBe(0);
      expect(store.sleepTimerEndsAt).toBe(null);
      expect(store.sleepTimerRemainingMs).toBe(0);
      expect(store.isSleepTimerActive).toBe(false);
    });
  });

  describe("showLoadingIndicator", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("does not appear when loading finishes before the delay", async () => {
      const store = usePlayerStore();

      store.status = "loading";
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);

      store.status = "playing";
      await nextTick();
      await vi.advanceTimersByTimeAsync(1000);

      expect(store.showLoadingIndicator).toBe(false);
    });

    it("appears when loading persists past the delay", async () => {
      const store = usePlayerStore();

      store.status = "loading";
      await nextTick();
      expect(store.showLoadingIndicator).toBe(false);

      await vi.advanceTimersByTimeAsync(300);
      expect(store.showLoadingIndicator).toBe(true);
    });

    it("stays visible for the minimum time after loading ends", async () => {
      const store = usePlayerStore();

      store.status = "loading";
      await nextTick();
      await vi.advanceTimersByTimeAsync(300);
      expect(store.showLoadingIndicator).toBe(true);

      store.status = "playing";
      await nextTick();
      await vi.advanceTimersByTimeAsync(100);
      expect(store.showLoadingIndicator).toBe(true);

      await vi.advanceTimersByTimeAsync(150);
      expect(store.showLoadingIndicator).toBe(false);
    });

    it("keeps the indicator up when loading resumes before the hide delay", async () => {
      const store = usePlayerStore();

      store.status = "loading";
      await nextTick();
      await vi.advanceTimersByTimeAsync(300);

      store.status = "buffering";
      await nextTick();
      store.status = "loading";
      await nextTick();
      await vi.advanceTimersByTimeAsync(1000);

      expect(store.showLoadingIndicator).toBe(true);
    });
  });

  describe("computed states", () => {
    it("should compute isPlaying correctly for different states", () => {
      const store = usePlayerStore();

      store.status = "playing";
      expect(store.isPlaying).toBe(true);

      store.status = "buffering";
      expect(store.isPlaying).toBe(true);

      store.status = "idle";
      expect(store.isPlaying).toBe(false);

      store.status = "paused";
      expect(store.isPlaying).toBe(false);

      store.status = "error";
      expect(store.isPlaying).toBe(false);

      store.status = "loading";
      expect(store.isPlaying).toBe(false);
    });

    it("should compute isLoading correctly", () => {
      const store = usePlayerStore();

      store.status = "loading";
      expect(store.isLoading).toBe(true);

      store.status = "playing";
      expect(store.isLoading).toBe(false);

      store.status = "idle";
      expect(store.isLoading).toBe(false);
    });

    it("should compute progress correctly", () => {
      const store = usePlayerStore();

      store.duration = 100;
      store.currentTime = 25;
      expect(store.progress).toBe(25);

      store.currentTime = 50;
      expect(store.progress).toBe(50);

      store.duration = 0;
      expect(store.progress).toBe(0);

      store.duration = -10;
      store.currentTime = 50;
      expect(store.progress).toBe(0);
    });

    it("should compute canPlay when player is ready", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      expect(store.canPlay).toBe(true);
    });

    it("should compute canPlay when player is not ready", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      Object.defineProperty(mockPlayer, "isReady", { get: () => false });
      expect(store.canPlay).toBe(false);
    });

    it("should compute canPlay when player is null", () => {
      const store = usePlayerStore();
      expect(store.canPlay).toBe(false);
    });

    it("should compute canSeek correctly", async () => {
      const store = usePlayerStore();

      await store.playPlayerTrack(createLibraryTrack());
      store.duration = 100;
      expect(store.canSeek).toBe(true);

      store.duration = 0;
      expect(store.canSeek).toBe(false);
    });

    it("should not allow seek when player is null", () => {
      const store = usePlayerStore();
      expect(store.canSeek).toBe(false);
    });

    it("should not allow seek for live streams", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.status = "playing";
      store.duration = 0;
      store.currentTrack = {
        kind: "ephemeral", id: "stream-1", title: "Live Stream",
        source: { type: "url", url: "stream.m3u8" },
      } as NonNullable<typeof store.currentTrack>;

      expect(store.isLiveStream).toBe(true);
      expect(store.canSeek).toBe(false);
    });
  });

  describe("isLiveStream detection", () => {
    it("should not be live stream when no track is playing", () => {
      const store = usePlayerStore();
      store.duration = 0;
      store.currentTrack = null;

      expect(store.isLiveStream).toBe(false);
    });

    it("should be live stream for HLS URL with duration 0", () => {
      const store = usePlayerStore();
      store.duration = 0;
      store.currentTrack = {
        kind: "ephemeral", id: "stream-1", title: "Live Stream",
        source: { type: "url", url: "https://example.com/stream.m3u8" },
      } as NonNullable<typeof store.currentTrack>;

      expect(store.isLiveStream).toBe(true);
    });

    it("should not be live stream for regular audio", () => {
      const store = usePlayerStore();
      store.duration = 180;
      store.currentTrack = {
        kind: "ephemeral", id: "track-1", title: "Song",
        source: { type: "url", url: "https://example.com/song.mp3" },
      } as NonNullable<typeof store.currentTrack>;

      expect(store.isLiveStream).toBe(false);
    });

    it("should not be live stream when duration > 0", () => {
      const store = usePlayerStore();
      store.duration = 180;
      store.currentTrack = createLibraryTrack();

      expect(store.isLiveStream).toBe(false);
    });

    it("should be live stream for HLS library track with duration 0", () => {
      const store = usePlayerStore();
      store.duration = 0;
      store.currentTrack = createLibraryTrack({ source: TrackSource.REMOTE_HLS, storagePath: "stream.m3u8" });

      expect(store.isLiveStream).toBe(true);
    });
  });

  describe("volume controls", () => {
    it("should set volume within valid range", () => {
      const store = usePlayerStore();

      store.setVolume(0.5);
      expect(store.volume).toBe(0.5);

      store.setVolume(0);
      expect(store.volume).toBe(0);

      store.setVolume(1);
      expect(store.volume).toBe(1);

      store.setVolume(1.5);
      expect(store.volume).toBe(1.5);

      store.setVolume(-0.5);
      expect(store.volume).toBe(-0.5);
    });

    it("should set muted state", () => {
      const store = usePlayerStore();

      store.setMuted(true);
      expect(store.isMuted).toBe(true);

      store.setMuted(false);
      expect(store.isMuted).toBe(false);
    });

    it("should call player method when setVolume", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());

      store.setVolume(0.8);
      expect(mockPlayerMethods.setVolume).toHaveBeenCalledWith(0.8);
    });

    it("should call player method when setMuted", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());

      store.setMuted(true);
      expect(mockPlayerMethods.setMuted).toHaveBeenCalledWith(true);
    });

    it("should call player toggleMute", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());

      store.toggleMute();
      expect(mockPlayerMethods.toggleMute).toHaveBeenCalled();
    });
  });

  describe("seek controls", () => {
    it("should seek to specific time when allowed", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.duration = 100;

      store.seekTo(50);
      expect(mockPlayerMethods.seek).toHaveBeenCalledWith(50);
    });

    it("should not seek when canSeek is false", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.duration = 0;

      store.seekTo(50);
      expect(mockPlayerMethods.seek).not.toHaveBeenCalled();
    });

    it("should not seek when player is null", () => {
      const store = usePlayerStore();
      store.duration = 100;

      store.seekTo(50);
      expect(mockPlayerMethods.seek).not.toHaveBeenCalled();
    });

    it("should seek by percent", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.duration = 100;

      store.seekPercent(50);
      expect(mockPlayerMethods.seekPercent).toHaveBeenCalledWith(0.5);
    });

    it("should not seekPercent when canSeek is false", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.duration = 0;

      store.seekPercent(50);
      expect(mockPlayerMethods.seekPercent).not.toHaveBeenCalled();
    });
  });

  describe("repeat mode", () => {
    it("should cycle through repeat modes", () => {
      const store = usePlayerStore();

      expect(store.repeatMode).toBe("off");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("all");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("one");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("off");
    });

    it("should handle all repeat modes explicitly", () => {
      const store = usePlayerStore();

      store.repeatMode = "off";
      store.toggleRepeat();
      expect(store.repeatMode).toBe("all");

      store.repeatMode = "all";
      store.toggleRepeat();
      expect(store.repeatMode).toBe("one");

      store.repeatMode = "one";
      store.toggleRepeat();
      expect(store.repeatMode).toBe("off");
    });
  });

  describe("toggle play/pause logic", () => {
    it("should not be playing when status is idle", () => {
      const store = usePlayerStore();
      store.status = "idle";
      expect(store.isPlaying).toBe(false);
    });

    it("should not be playing when status is paused", () => {
      const store = usePlayerStore();
      store.status = "paused";
      expect(store.isPlaying).toBe(false);
    });

    it("should be playing when status is playing", () => {
      const store = usePlayerStore();
      store.status = "playing";
      expect(store.isPlaying).toBe(true);
    });

    it("should be playing when status is buffering", () => {
      const store = usePlayerStore();
      store.status = "buffering";
      expect(store.isPlaying).toBe(true);
    });
  });

  describe("stop functionality", () => {
    it("should stop player and reset time when player exists", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.currentTime = 50;

      store.stop();
      expect(mockPlayerMethods.stop).toHaveBeenCalled();
      expect(store.currentTime).toBe(0);
    });

    it("should not call stop when player is null", () => {
      const store = usePlayerStore();
      store.currentTime = 50;

      store.stop();
      expect(store.currentTime).toBe(50);
    });
  });

  describe("playPlayerTrack", () => {
    it("should reset currentTime and duration before playing a new track", async () => {
      const store = usePlayerStore();
      store.currentTime = 120;
      store.duration = 300;

      await store.playPlayerTrack(createLibraryTrack());

      expect(store.currentTime).toBe(0);
      expect(store.duration).toBe(0);
    });

    it("should create player and load track URL", async () => {
      const store = usePlayerStore();

      await store.playPlayerTrack(createLibraryTrack());

      expect(store.player).not.toBeNull();
      expect(store.currentTrack).not.toBeNull();
      expect(store.currentTrack!.title).toBe("Test Track");
    });

    it("should throw on broken library track", async () => {
      const store = usePlayerStore();
      const brokenTrack = createLibraryTrack({ state: TrackState.BROKEN });

      const failure = await store.playPlayerTrack(brokenTrack).then(() => null, (e: unknown) => e);
      expect(failure).toBeInstanceOf(PlaybackFailure);
      expect((failure as PlaybackFailure).message).toBe('Track is marked as broken: "Test Track"');
      expect((failure as PlaybackFailure).error).toEqual({ kind: "broken", trackId: "track-1" });
      expect(store.currentTrack).toBeNull();
      expect(store.status).toBe("idle");
    });

    it("should reset currentTime and duration when switching tracks", async () => {
      const store = usePlayerStore();
      store.currentTime = 120;
      store.duration = 300;

      const trackA = createLibraryTrack({ id: "track-a" as never, title: "Track A" });
      await store.playPlayerTrack(trackA);

      store.currentTime = 45;
      store.duration = 180;

      const trackB = createLibraryTrack({ id: "track-b" as never, title: "Track B" });
      await store.playPlayerTrack(trackB);

      expect(store.currentTime).toBe(0);
      expect(store.duration).toBe(0);
      expect(store.currentTrack!.title).toBe("Track B");
    });

    it("re-applies the persisted playbackRate after load (survives reload)", async () => {
      const store = usePlayerStore();
      // A non-default rate persisted across a reload: player is null until play.
      store.setPlaybackRate(1.5);

      const setRate = mockPlayerMethods.setPlaybackRate;
      const load = mockPlayerMethods.load;
      setRate.mockClear();
      load.mockClear();

      await store.playPlayerTrack(createLibraryTrack());

      // load() resets the media element's rate to 1; the store must re-apply the
      // persisted rate afterwards, otherwise the track plays at 1x after reload.
      const reapplied = setRate.mock.calls.some((call, i) => {
        const order = setRate.mock.invocationCallOrder[i];
        const afterLoad = load.mock.invocationCallOrder.some(l => order > l);
        return call[0] === 1.5 && afterLoad;
      });
      expect(reapplied).toBe(true);
    });

    it("lets the newest play request win when tracks start rapidly", async () => {
      const store = usePlayerStore();

      // Track A's load hangs (slow remote stream, e.g. stream:// via proxy).
      let resolveLoadA!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { resolveLoadA = resolve; }),
      );

      const first = store.playPlayerTrack(
        createLibraryTrack({ id: "track-a" as never, title: "Track A" }),
      );
      await vi.waitFor(() => expect(mockPlayerMethods.load).toHaveBeenCalledTimes(1));

      const engine = mockPlayer;
      const second = store.playPlayerTrack(
        createLibraryTrack({ id: "track-b" as never, title: "Track B" }),
      );
      await second;

      // The stale request resumes only after the newer one already finished;
      // its request token is stale, so it must bail before playing.
      resolveLoadA();
      await first;

      expect(store.currentTrack?.title).toBe("Track B");
      // One shared engine for both tracks, and only track B ever plays.
      expect(mockPlayer).toBe(engine);
      expect(mockPlayerMethods.dispose).not.toHaveBeenCalled();
      expect(mockPlayerMethods.play).toHaveBeenCalledTimes(1);
    });

    it("reuses the same engine across consecutive tracks", async () => {
      const store = usePlayerStore();

      await store.playPlayerTrack(createLibraryTrack({ id: "track-a" as never, title: "Track A" }));
      const engine = mockPlayer;
      await store.playPlayerTrack(createLibraryTrack({ id: "track-b" as never, title: "Track B" }));

      expect(mockPlayer).toBe(engine);
      expect(mockPlayerMethods.dispose).not.toHaveBeenCalled();
      expect(mockPlayerMethods.load).toHaveBeenCalledTimes(2);
    });
  });

  describe("resolvePlayback order for remote tracks", () => {
    const remoteTrack = () => createLibraryTrack({
      id: "yt:dQw4w9WgXcQ" as never,
      source: TrackSource.REMOTE_YT,
      storagePath: "",
    });

    beforeEach(() => {
      offlineCopyMock.findById.mockResolvedValue(ok(undefined));
    });

    it("plays the offline copy before asking the source", async () => {
      offlineCopyMock.findById.mockResolvedValue(ok({
        trackId: "yt:dQw4w9WgXcQ",
        storagePath: "offline/yt/dQw4w9WgXcQ.m4a",
        sizeBytes: 1,
        format: {},
        downloadedAt: 0,
      }));
      const store = usePlayerStore();

      await store.playPlayerTrack(remoteTrack());

      expect(storageMock.getAudioUrl).toHaveBeenCalledWith("offline/yt/dQw4w9WgXcQ.m4a");
      expect(sourcesMock.forTrack).not.toHaveBeenCalled();
    });

    it("falls back to the source stream when no offline copy exists", async () => {
      const resolveStreamUrl = vi.fn(() => okAsync("stream://localhost/yt/dQw4w9WgXcQ"));
      sourcesMock.forTrack.mockReturnValue({ resolveStreamUrl });
      const store = usePlayerStore();

      await store.playPlayerTrack(remoteTrack());

      expect(sourcesMock.forTrack).toHaveBeenCalledWith("yt:dQw4w9WgXcQ");
      expect(resolveStreamUrl).toHaveBeenCalledWith("yt:dQw4w9WgXcQ");
      expect(mockPlayerMethods.load).toHaveBeenCalledWith("stream://localhost/yt/dQw4w9WgXcQ");
      // The offline copy was checked first and came back empty.
      expect(offlineCopyMock.findById).toHaveBeenCalledWith("yt:dQw4w9WgXcQ");
    });

    it("surfaces a typed source error as a player error", async () => {
      sourcesMock.forTrack.mockReturnValue({
        resolveStreamUrl: vi.fn(() => errAsync({ kind: "NETWORK", message: "upstream down" })),
      });
      const store = usePlayerStore();

      const failure = await store.playPlayerTrack(remoteTrack()).then(() => null, (e: unknown) => e);
      expect(failure).toBeInstanceOf(PlaybackFailure);
      expect((failure as PlaybackFailure).message).toBe("[NETWORK] upstream down");
      expect((failure as PlaybackFailure).error).toMatchObject({ kind: "source", cause: { kind: "NETWORK" } });
    });

    it("never touches offline copies or sources for local tracks", async () => {
      const store = usePlayerStore();

      await store.playPlayerTrack(createLibraryTrack());

      expect(offlineCopyMock.findById).not.toHaveBeenCalled();
      expect(sourcesMock.forTrack).not.toHaveBeenCalled();
      expect(storageMock.getAudioUrl).toHaveBeenCalledWith("/path/to/track.mp3");
    });
  });

  describe("dispose functionality", () => {
    it("should dispose player when player exists", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());

      await store.dispose();

      expect(mockPlayerMethods.dispose).toHaveBeenCalled();
      expect(store.player).toBe(null);
    });

    it("should do nothing when player is null", async () => {
      const store = usePlayerStore();

      await store.dispose();

      expect(store.player).toBe(null);
    });
  });

  describe("sleep timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-06T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should activate sleep timer and expose remaining time", async () => {
      const store = usePlayerStore();

      store.setSleepTimer(5 * 60 * 1000);
      await nextTick();

      expect(store.isSleepTimerActive).toBe(true);
      expect(store.sleepTimerEndsAt).toBe(Date.now() + 5 * 60 * 1000);
      expect(store.sleepTimerRemainingMs).toBe(5 * 60 * 1000);
    });

    it("should update remaining time while timer is active", async () => {
      const store = usePlayerStore();

      store.setSleepTimer(5 * 1000);
      await nextTick();
      vi.advanceTimersByTime(2000);

      expect(store.sleepTimerRemainingMs).toBe(3000);
    });

    it("should cancel sleep timer", () => {
      const store = usePlayerStore();

      store.setSleepTimer(5 * 1000);
      store.cancelSleepTimer();

      expect(store.isSleepTimerActive).toBe(false);
      expect(store.sleepTimerEndsAt).toBe(null);
      expect(store.sleepTimerRemainingMs).toBe(0);
    });

    it("should cancel sleep timer for invalid duration", () => {
      const store = usePlayerStore();

      store.setSleepTimer(5 * 1000);
      store.setSleepTimer(0);

      expect(store.isSleepTimerActive).toBe(false);
      expect(store.sleepTimerEndsAt).toBe(null);
      expect(store.sleepTimerRemainingMs).toBe(0);
    });

    it("should pause playback when sleep timer expires", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.status = "playing";

      store.setSleepTimer(5 * 1000);
      await nextTick();
      vi.advanceTimersByTime(5000);

      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
      expect(store.isSleepTimerActive).toBe(false);
      expect(store.sleepTimerRemainingMs).toBe(0);
    });

    it("should clear sleep timer on dispose", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.setSleepTimer(5 * 1000);

      await store.dispose();

      expect(store.isSleepTimerActive).toBe(false);
      expect(store.sleepTimerEndsAt).toBe(null);
      expect(store.sleepTimerRemainingMs).toBe(0);
    });
  });

  describe("getAudioGraph", () => {
    it("should return null when player is null", () => {
      const store = usePlayerStore();
      expect(store.getAudioGraph()).toBe(null);
    });

    it("should return graph when player exists", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      const mockGraph = {};
      Object.defineProperty(mockPlayer, "graph", { get: () => mockGraph });

      expect(store.getAudioGraph()).toBe(mockGraph);
    });

    it("should return null when graph is undefined", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      Object.defineProperty(mockPlayer, "graph", { get: () => undefined });

      expect(store.getAudioGraph()).toBe(null);
    });
  });

  describe("graphRevision", () => {
    it("should start at 0", () => {
      const store = usePlayerStore();
      expect(store.graphRevision).toBe(0);
    });

    it("should be updatable", () => {
      const store = usePlayerStore();
      store.graphRevision = 5;
      expect(store.graphRevision).toBe(5);
    });
  });

  describe("currentTime and duration", () => {
    it("should track currentTime", () => {
      const store = usePlayerStore();
      store.currentTime = 30;
      expect(store.currentTime).toBe(30);
    });

    it("should track duration", () => {
      const store = usePlayerStore();
      store.duration = 180;
      expect(store.duration).toBe(180);
    });

    it("should compute progress with various values", () => {
      const store = usePlayerStore();

      store.duration = 100;
      store.currentTime = 0;
      expect(store.progress).toBe(0);

      store.currentTime = 100;
      expect(store.progress).toBe(100);

      store.currentTime = 33.33;
      expect(store.progress).toBeCloseTo(33.33, 1);
    });
  });

  describe("fade behavior", () => {
    // Builds a store with a live engine instance and playback in progress —
    // the precondition for every fade path.
    async function startedStore() {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.status = "playing";
      return store;
    }

    it("pause with fade waits for the fade-out before pausing the engine", async () => {
      const store = await startedStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );

      store.pause();

      // Status flips optimistically; the engine keeps playing until the fade ends.
      expect(store.status).toBe("paused");
      expect(mockPlayerMethods.fadeOut).toHaveBeenCalledWith(300);
      expect(mockPlayerMethods.pause).not.toHaveBeenCalled();

      finishFade();
      await flushPromises();

      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
    });

    it("toggling play during a fade-out aborts the deferred pause", async () => {
      const store = await startedStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );

      store.pause();
      await store.togglePlay();

      expect(store.status).toBe("playing");
      expect(mockPlayerMethods.cancelFade).toHaveBeenCalled();

      finishFade();
      await flushPromises();

      // The aborted fade must not land its deferred pause after the fact.
      expect(mockPlayerMethods.pause).not.toHaveBeenCalled();
    });

    it("ignores a second pause while a fade-out is already pending", async () => {
      const store = await startedStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );

      store.pause();
      // The engine keeps reporting playing/buffering blips while the ramp
      // runs — they are the very audio being faded and must not reopen the
      // "playing" state for a second pause to act on.
      (mockPlayer as { trigger: (e: string, ...a: unknown[]) => void })
        .trigger("statechange", { to: "buffering" });
      (mockPlayer as { trigger: (e: string, ...a: unknown[]) => void })
        .trigger("statechange", { to: "playing" });
      expect(store.status).toBe("paused");
      store.pause();

      expect(mockPlayerMethods.fadeOut).toHaveBeenCalledTimes(1);

      finishFade();
      await flushPromises();
      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
    });

    it("play with fade enabled ramps in instead of hard-starting", async () => {
      const store = await startedStore();
      store.status = "paused";
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeInDuration = 200;
      mockPlayerMethods.play.mockClear();

      await store.play();

      expect(mockPlayerMethods.fadeIn).toHaveBeenCalledWith(200);
      expect(mockPlayerMethods.play).not.toHaveBeenCalled();
    });

    it("play without fade restores the fade multiplier before starting", async () => {
      const store = await startedStore();
      store.status = "paused";
      mockPlayerMethods.play.mockClear();
      mockPlayerMethods.fadeTo.mockClear();

      await store.play();

      // A prior fade-out may have left the multiplier at 0; it must be restored
      // while still paused so playback is audible without a gain jump.
      expect(mockPlayerMethods.fadeTo).toHaveBeenCalledWith(1, 0);
      expect(mockPlayerMethods.setVolume).toHaveBeenCalledWith(store.volume);
      expect(mockPlayerMethods.play).toHaveBeenCalledTimes(1);
    });

    it("play during an interrupted fade-out restores playing state with a ramp", async () => {
      const store = await startedStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeInDuration = 200;
      mockAudioSettings.fadeOutDuration = 300;

      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );

      store.pause();
      // The engine never actually stopped: the fade-out is still in flight.
      Object.defineProperty(mockPlayer, "isPlaying", { get: () => true });

      await store.play();

      expect(store.status).toBe("playing");
      expect(mockPlayerMethods.fadeTo).toHaveBeenCalledWith(1, 200);

      finishFade();
      await flushPromises();
      expect(mockPlayerMethods.pause).not.toHaveBeenCalled();
    });

    it("completes the deferred pause when seeking during a fade-out", async () => {
      const store = await startedStore();
      store.duration = 200;
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );

      store.pause();
      expect(store.status).toBe("paused");

      // Seeking abandons the deferred pause's abort-guarded .then — the engine
      // must be paused right here, or it keeps playing silently at gain 0
      // while the UI says paused (and later "ends" into the next track at
      // full volume).
      store.seekTo(50);

      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
      expect(mockPlayerMethods.cancelFade).toHaveBeenCalledTimes(1);
      expect(mockPlayerMethods.seek).toHaveBeenCalledWith(50);
      // Pause must land before cancelFade: cancelFade snaps the fade
      // multiplier back to full and would pop over still-playing audio.
      expect(mockPlayerMethods.pause.mock.invocationCallOrder[0])
        .toBeLessThan(mockPlayerMethods.cancelFade.mock.invocationCallOrder[0]);

      finishFade();
      await flushPromises();

      // The fade's own deferred pause was aborted — no double pause.
      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
      expect(store.status).toBe("paused");
    });

    it("stop with fade fades out before stopping the engine", async () => {
      const store = await startedStore();
      store.currentTime = 55;
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      store.stop();
      expect(mockPlayerMethods.stop).not.toHaveBeenCalled();

      await flushPromises();

      expect(mockPlayerMethods.stop).toHaveBeenCalledTimes(1);
      expect(store.currentTime).toBe(0);
    });
  });

  describe("player event wiring", () => {
    type EngineMock = { trigger: (event: string, ...args: unknown[]) => void };
    const engine = () => mockPlayer as unknown as EngineMock;

    it("mirrors engine events into store state", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());

      engine().trigger("statechange", { to: "playing" });
      expect(store.status).toBe("playing");

      engine().trigger("timeupdate", { currentTime: 42 });
      expect(store.currentTime).toBe(42);

      engine().trigger("durationchange", 200);
      expect(store.duration).toBe(200);

      engine().trigger("volumechange", { volume: 0.3, muted: true });
      expect(store.volume).toBe(0.3);
      expect(store.isMuted).toBe(true);

      engine().trigger("ratechange", 1.25);
      expect(store.playbackRate).toBe(1.25);
    });

    it("resets time and emits trackEnded when a track ends", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      store.currentTime = 199;

      const onEnded = vi.fn();
      const off = useEventBus(trackEndedEvent).on(onEnded);
      engine().trigger("ended");
      off();

      expect(store.currentTime).toBe(0);
      expect(onEnded).toHaveBeenCalledTimes(1);
    });

    it("finalizes the previous listen as skipped when switching tracks", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      statsMock.stopListening.mockClear();

      engine().trigger("timeupdate", { currentTime: 42 });
      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(42, { skipped: true });
    });

    it("reflects a pause the app did not ask for", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      engine().trigger("statechange", { to: "playing" });
      expect(store.status).toBe("playing");

      // The platform can stop the element under the store: audio focus loss,
      // an incoming call, Chromium pausing a hidden video-bearing element.
      // The engine reports it as `pause` only — no statechange — so without
      // this the UI kept showing playback over a silent, frozen element.
      engine().trigger("pause", undefined);

      expect(store.status).toBe("paused");
    });

    it("ignores an engine pause belonging to the outgoing track mid-switch", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      engine().trigger("statechange", { to: "playing" });

      const switching = store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));
      expect(store.status).toBe("loading");

      engine().trigger("pause", undefined);
      expect(store.status).toBe("loading");

      await switching;
    });

    it("holds the optimistic loading status through engine chatter while switching tracks", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      engine().trigger("statechange", { to: "playing" });
      expect(store.status).toBe("playing");

      // Skip to the next track: playPlayerTrack sets "loading" synchronously,
      // then the engine's load() resets itself through "idle" and resolves
      // through "ready" before play() lands. None of that may reach the UI —
      // a single frame of "not playing" visibly re-morphs the pause icon.
      const switching = store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));
      expect(store.status).toBe("loading");

      engine().trigger("statechange", { to: "idle" });
      expect(store.status).toBe("loading");
      engine().trigger("statechange", { to: "ready" });
      expect(store.status).toBe("loading");
      engine().trigger("statechange", { to: "paused" });
      expect(store.status).toBe("loading");
      // The OLD media stalling or resuming is not the new track either — and
      // letting it through would close the switch window early, so the old
      // track's ended/timeupdate would leak into the new one.
      engine().trigger("statechange", { to: "buffering" });
      expect(store.status).toBe("loading");
      engine().trigger("statechange", { to: "playing" });
      expect(store.status).toBe("loading");
      expect(store.playbackState.kind).toBe("resolving");

      await switching;

      // The media is the new track's now; the engine's own transitions land.
      expect(store.playbackState.kind).toBe("starting");
      expect(store.status).toBe("loading");
      engine().trigger("statechange", { to: "playing" });
      expect(store.status).toBe("playing");

      // Once the switch is over, the filter must release: a real stop's
      // idle transition still has to reach the store.
      engine().trigger("statechange", { to: "idle" });
      expect(store.status).toBe("idle");
    });

    it("ignores events from a superseded player", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      const stale = engine();

      // The store let go of this engine instance (dispose, load-error recovery).
      await store.dispose();

      stale.trigger("statechange", { to: "playing" });
      stale.trigger("timeupdate", { currentTime: 42 });

      expect(store.status).not.toBe("playing");
      expect(store.currentTime).toBe(0);
    });
  });

  describe("track switch race guards", () => {
    type EngineMock = { trigger: (event: string, ...args: unknown[]) => void };
    const engine = () => mockPlayer as unknown as EngineMock;

    // Parks the next engine load so the switching window stays open: the old
    // media keeps playing (and firing events) while the new track "loads".
    const startParkedSwitch = async (store: ReturnType<typeof usePlayerStore>) => {
      let finishLoad!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      );
      const switching = store.playPlayerTrack(
        createLibraryTrack({ id: "track-b" as Track["id"], title: "Track B" }),
      );
      await flushPromises();
      return { switching, finishLoad };
    };

    it("ignores the previous track's natural end while a switch is in flight", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack({ id: "track-a" as Track["id"] }));
      engine().trigger("statechange", { to: "playing" });

      const { switching, finishLoad } = await startParkedSwitch(store);

      const onEnded = vi.fn();
      const off = useEventBus(trackEndedEvent).on(onEnded);
      // Track A reaches its natural end while B is still loading. Reacting
      // (queue.next) would supersede the user's own selection of B.
      engine().trigger("ended");
      expect(onEnded).not.toHaveBeenCalled();

      finishLoad();
      await switching;

      // Once the switch settles, a real end must still advance the queue.
      engine().trigger("ended");
      expect(onEnded).toHaveBeenCalledTimes(1);
      off();
    });

    it("releases the status filter when togglePlay interrupts a loading switch", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack({ id: "track-a" as Track["id"] }));
      engine().trigger("statechange", { to: "playing" });

      const { switching, finishLoad } = await startParkedSwitch(store);
      expect(store.status).toBe("loading");

      // Mid-load the engine is not ready, so togglePlay (space bar, media
      // key, notification play — the buttons without a loading guard) enters
      // play()'s cold-start branch and supersedes the switch request.
      Object.defineProperty(mockPlayer, "isReady", { get: () => false });
      await store.togglePlay();

      finishLoad();
      await switching;

      // The superseded switch must not leave the status filter latched:
      // engine state changes have to reach the store again.
      engine().trigger("statechange", { to: "playing" });
      engine().trigger("statechange", { to: "paused" });
      expect(store.status).toBe("paused");
    });

    it("processes a natural end that lands during the new track's fade-in", async () => {
      const store = usePlayerStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeInDuration = 5;

      // The fade-in promise pends for the whole fade while audio already
      // plays — a track shorter than the fade genuinely ends inside it.
      let finishFadeIn!: () => void;
      mockPlayerMethods.fadeIn.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFadeIn = resolve; }),
      );

      const playing = store.playPlayerTrack(createLibraryTrack({ id: "track-a" as Track["id"] }));
      await flushPromises();
      expect(mockPlayerMethods.fadeIn).toHaveBeenCalled();

      const onEnded = vi.fn();
      const off = useEventBus(trackEndedEvent).on(onEnded);
      // The media is already the NEW track (load resolved): its end is real
      // and must advance the queue, or playback stalls silently forever.
      engine().trigger("ended");
      expect(onEnded).toHaveBeenCalledTimes(1);
      off();

      finishFadeIn();
      await playing;
    });

    it("lets timeupdate through once the new track's media has loaded", async () => {
      const store = usePlayerStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeInDuration = 5;

      let finishFadeIn!: () => void;
      mockPlayerMethods.fadeIn.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFadeIn = resolve; }),
      );

      const playing = store.playPlayerTrack(createLibraryTrack({ id: "track-a" as Track["id"] }));
      await flushPromises();

      // Audio is audible during the fade-in; the progress bar must move.
      engine().trigger("timeupdate", { currentTime: 2 });
      expect(store.currentTime).toBe(2);

      finishFadeIn();
      await playing;
    });

    it("keeps the optimistic zeroed position while the next track loads", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack({ id: "track-a" as Track["id"] }));
      engine().trigger("timeupdate", { currentTime: 120 });
      expect(store.currentTime).toBe(120);

      const { switching, finishLoad } = await startParkedSwitch(store);

      // The old media is still audible while B loads; its position samples
      // must not overwrite the freshly zeroed UI position.
      engine().trigger("timeupdate", { currentTime: 121 });
      expect(store.currentTime).toBe(0);

      finishLoad();
      await switching;
    });
  });

  describe("listen-time accounting", () => {
    type EngineMock = { trigger: (event: string, ...args: unknown[]) => void };
    const engine = () => mockPlayer as unknown as EngineMock;

    const startedTrackedStore = async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      engine().trigger("durationchange", 200);
      statsMock.stopListening.mockClear();
      return store;
    };

    it("survives background timer throttling: sparse timeupdates lose no time", async () => {
      const store = await startedTrackedStore();

      // Android WebView in the background clamps JS timers, so minutes of
      // playback can arrive as a single position sample. The position delta
      // must be credited in full — tick counting or wall clock would drift.
      engine().trigger("timeupdate", { currentTime: 3 });
      engine().trigger("timeupdate", { currentTime: 190 });

      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(190, { skipped: true });
    });

    it("does not count a seek jump as listened time", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 10 });
      // The engine announces every seek with its clamped target...
      engine().trigger("seeking", 150);
      engine().trigger("seeked", 150);
      // ...so the post-seek sample only credits playback past the target.
      engine().trigger("timeupdate", { currentTime: 152 });

      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(12, { skipped: true });
    });

    it("counts re-listened spans after a backwards seek", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 100 });
      engine().trigger("seeking", 40);
      engine().trigger("seeked", 40);
      engine().trigger("timeupdate", { currentTime: 70 });

      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(130, { skipped: true });
    });

    it("credits the final sliver up to the duration on a natural end", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 199 });
      engine().trigger("ended");

      // The store zeroes currentTime for the UI, but the session keeps the
      // full listened total for the lifecycle's completed-stop.
      expect(store.currentTime).toBe(0);
      expect(store.getListenedSeconds()).toBe(200);
    });

    it("samples the live engine position on stop, not the throttled time ref", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 30 });
      // In the background the last timeupdate can be minutes stale while the
      // element clock kept moving — the finalize pulls the element directly.
      Object.defineProperty(mockPlayer, "currentTime", { get: () => 95 });

      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(95, { skipped: true });
    });

    it("finalizes an open session with accumulated seconds when the track is cleared", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 30 });
      store.clearCurrentTrack();

      expect(statsMock.stopListening).toHaveBeenCalledWith(30, { skipped: true });
    });

    it("does not credit the previous track's engine position to a rapid-skipped session", async () => {
      const store = await startedTrackedStore();

      // Track A is 180s in, still audible on the shared engine.
      engine().trigger("timeupdate", { currentTime: 180 });
      Object.defineProperty(mockPlayer, "currentTime", { get: () => 180 });

      // Track B's remote source resolution / load is slow: park the load so
      // the engine keeps playing A for the whole window.
      let finishLoad!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      );
      const switching = store.playPlayerTrack(
        createLibraryTrack({ id: "track-b" as Track["id"] }),
      );
      statsMock.stopListening.mockClear();
      await flushPromises();

      // A's positions keep arriving while B resolves — they are A's audio,
      // not B's, and must not anchor or credit B's session.
      engine().trigger("timeupdate", { currentTime: 181 });

      // The user skips again before B's media ever loaded: B produced zero
      // audio, so its session must finalize at 0 — not at A's 180s (which
      // would even count as completed and bump B's playCount).
      await store.playPlayerTrack(createLibraryTrack({ id: "track-c" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(0, { skipped: true });

      finishLoad();
      await switching;
    });

    it("starts each track's session from zero", async () => {
      const store = await startedTrackedStore();

      engine().trigger("timeupdate", { currentTime: 120 });
      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as Track["id"] }));
      statsMock.stopListening.mockClear();

      engine().trigger("timeupdate", { currentTime: 15 });
      await store.playPlayerTrack(createLibraryTrack({ id: "track-3" as Track["id"] }));

      expect(statsMock.stopListening).toHaveBeenCalledWith(15, { skipped: true });
    });
  });

  describe("play() cold start", () => {
    it("spins up a player for the current track and restores position", async () => {
      const store = usePlayerStore();
      // A persisted session: track + position survive a reload, player is null.
      store.currentTrack = createLibraryTrack();
      store.currentTime = 42;

      await store.play();

      expect(mockPlayerMethods.load).toHaveBeenCalledWith("blob:mock-audio-url");
      expect(mockPlayerMethods.seek).toHaveBeenCalledWith(42);
      expect(mockPlayerMethods.play).toHaveBeenCalledTimes(1);
    });

    it("does nothing when there is no track to play", async () => {
      const store = usePlayerStore();

      await store.play();

      expect(mockPlayer).toBeUndefined();
      expect(store.status).toBe("idle");
    });

    it("counts listened time for a restored track (the session is armed after load)", async () => {
      const store = usePlayerStore();
      store.currentTrack = createLibraryTrack();
      store.currentTime = 42;

      await store.play();
      (mockPlayer as { trigger: (e: string, ...a: unknown[]) => void })
        .trigger("seeking", 42);
      (mockPlayer as { trigger: (e: string, ...a: unknown[]) => void })
        .trigger("timeupdate", { currentTime: 72 });
      statsMock.stopListening.mockClear();

      await store.playPlayerTrack(createLibraryTrack({ id: "track-2" as never }));

      // Before the cold start shared the switch path it never armed the
      // session, so a restored track was never credited until the next switch.
      expect(statsMock.stopListening).toHaveBeenCalledWith(30, { skipped: true });
    });

    it("applies the track's loudness metadata on a cold start", async () => {
      const store = usePlayerStore();
      store.currentTrack = createLibraryTrack({ integratedLufs: -9, truePeakDbtp: -1 });

      await store.play();

      expect(mockPlayerMethods.setLoudnessMetadata).toHaveBeenCalledWith({
        integratedLufs: -9,
        truePeakDbtp: -1,
      });
    });

    it("refuses a broken restored track without touching the engine", async () => {
      const store = usePlayerStore();
      store.currentTrack = createLibraryTrack({ state: TrackState.BROKEN });

      await store.play();

      expect(mockPlayer).toBeUndefined();
      expect(store.status).toBe("idle");
    });

    it("settles into error instead of throwing when the restored load fails", async () => {
      const store = usePlayerStore();
      store.currentTrack = createLibraryTrack();
      mockPlayerMethods.load.mockRejectedValueOnce(new Error("decode failed"));

      // play() is called from UI handlers: it must not reject.
      await expect(store.play()).resolves.toBeUndefined();

      expect(store.status).toBe("error");
      expect(store.player).toBeNull();
      expect(store.currentTrack).not.toBeNull();
    });
  });

  describe("playPlayerTrack error handling", () => {
    it("marks error state and rethrows when the engine load fails", async () => {
      const store = usePlayerStore();
      mockPlayerMethods.load.mockRejectedValueOnce(new Error("decode failed"));

      const failure = await store.playPlayerTrack(createLibraryTrack()).then(() => null, (e: unknown) => e);
      expect(failure).toBeInstanceOf(PlaybackFailure);
      expect((failure as PlaybackFailure).message).toBe("decode failed");
      expect((failure as PlaybackFailure).error).toMatchObject({ kind: "engine" });

      expect(store.status).toBe("error");
      expect(store.player).toBeNull();
      // Non-storage errors keep the track so the UI can show what failed.
      expect(store.currentTrack).not.toBeNull();
    });
  });

  describe("playback state machine", () => {
    type EngineMock = { trigger: (event: string, ...args: unknown[]) => void };
    const engine = () => mockPlayer as unknown as EngineMock;

    const playingStore = async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      engine().trigger("statechange", { to: "playing" });
      engine().trigger("durationchange", 200);
      return store;
    };

    const parkFadeOut = () => {
      let finishFade!: () => void;
      mockPlayerMethods.fadeOut.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishFade = resolve; }),
      );
      return () => finishFade();
    };

    it("reports a fade-out-to-pause as not playing while the engine is still audible", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishFade = parkFadeOut();

      store.pause();

      expect(store.playbackState.kind).toBe("fadingOut");
      expect(store.isPlaying).toBe(false);
      expect(store.isPlaybackIntended).toBe(false);
      expect(store.status).toBe("paused");

      finishFade();
      await flushPromises();
      expect(store.playbackState.kind).toBe("paused");
      expect(mockPlayerMethods.pause).toHaveBeenCalledTimes(1);
    });

    it("reports a fade-out-to-stop as not playing from the moment stop is pressed", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishFade = parkFadeOut();

      store.stop();

      expect(store.playbackState).toMatchObject({ kind: "fadingOut", then: "stop" });
      expect(store.isPlaying).toBe(false);
      expect(mockPlayerMethods.stop).not.toHaveBeenCalled();

      finishFade();
      await flushPromises();
      expect(store.playbackState.kind).toBe("ready");
      expect(mockPlayerMethods.stop).toHaveBeenCalledTimes(1);
    });

    it("lets togglePlay rescue a fade-out-to-stop", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishFade = parkFadeOut();

      store.stop();
      await store.togglePlay();

      expect(store.playbackState.kind).toBe("playing");
      expect(mockPlayerMethods.cancelFade).toHaveBeenCalledTimes(1);

      finishFade();
      await flushPromises();
      // The aborted fade must not land its deferred stop after the fact.
      expect(mockPlayerMethods.stop).not.toHaveBeenCalled();
    });

    it("stops a paused engine immediately instead of fading silence", async () => {
      const store = await playingStore();
      engine().trigger("statechange", { to: "paused" });
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;

      store.stop();

      expect(mockPlayerMethods.fadeOut).not.toHaveBeenCalled();
      expect(mockPlayerMethods.stop).toHaveBeenCalledTimes(1);
      expect(store.currentTime).toBe(0);
    });

    it("turns an interrupted fade-out-to-pause into a fade-out-to-stop", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishPauseFade = parkFadeOut();

      store.pause();
      store.stop();

      expect(store.playbackState).toMatchObject({ kind: "fadingOut", then: "stop" });
      expect(mockPlayerMethods.fadeOut).toHaveBeenCalledTimes(2);

      // The first fade's deferred pause was aborted by the transition.
      finishPauseFade();
      await flushPromises();
      expect(mockPlayerMethods.pause).not.toHaveBeenCalled();
    });

    it("abandons a fade-out when the track ends inside it and still advances the queue", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishFade = parkFadeOut();

      store.stop();

      const onEnded = vi.fn();
      const off = useEventBus(trackEndedEvent).on(onEnded);
      // lyra moves to "ready" and then emits ended when the element runs out.
      engine().trigger("statechange", { to: "ready" });
      engine().trigger("ended");
      off();

      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(store.playbackState.kind).toBe("ready");

      finishFade();
      await flushPromises();
      // Nothing is left to stop: the deferred action was aborted.
      expect(mockPlayerMethods.stop).not.toHaveBeenCalled();
    });

    it("drops a fade-out when a platform pause lands on it, then starts fresh on play", async () => {
      const store = await playingStore();
      mockAudioSettings.isFadeEnabled = true;
      mockAudioSettings.fadeOutDuration = 300;
      const finishFade = parkFadeOut();

      store.pause();
      // A platform pause (focus loss) emits `pause` only; the deferred pause
      // is still in flight and is left to land harmlessly.
      engine().trigger("pause", undefined);
      expect(store.playbackState.kind).toBe("fadingOut");

      // The element is not playing any more, so play() must not "resume" a
      // ramp over a silent element — it starts over like any paused player.
      mockPlayerMethods.play.mockClear();
      await store.play();

      expect(store.playbackState.kind).toBe("paused");
      expect(mockPlayerMethods.play).toHaveBeenCalledTimes(1);

      finishFade();
      await flushPromises();
      expect(mockPlayerMethods.pause).not.toHaveBeenCalled();
    });

    it("walks a track switch through resolving → loading → starting", async () => {
      const store = usePlayerStore();
      let resolveUrl!: (url: string) => void;
      storageMock.getAudioUrl.mockImplementationOnce(
        () => new ResultAsync(new Promise((resolve) => { resolveUrl = url => resolve(ok(url)); })),
      );
      let finishLoad!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      );

      const playing = store.playPlayerTrack(createLibraryTrack());
      expect(store.playbackState.kind).toBe("resolving");
      expect(store.isLoading).toBe(true);
      expect(store.isPlaybackIntended).toBe(true);

      resolveUrl("blob:mock-audio-url");
      await flushPromises();
      expect(store.playbackState.kind).toBe("loading");

      finishLoad();
      await playing;
      expect(store.playbackState.kind).toBe("starting");
      expect(store.status).toBe("loading");
    });

    it("never lets a superseded request reopen its switch window", async () => {
      const store = usePlayerStore();
      let finishLoadA!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishLoadA = resolve; }),
      );

      const first = store.playPlayerTrack(createLibraryTrack({ id: "track-a" as never }));
      await flushPromises();
      await store.playPlayerTrack(createLibraryTrack({ id: "track-b" as never }));
      engine().trigger("statechange", { to: "playing" });

      finishLoadA();
      await first;

      // A's late wake-up must not touch the state B owns.
      expect(store.playbackState.kind).toBe("playing");
      expect(store.currentTrack?.id).toBe("track-b");
    });

    it("settles into error and discards the engine when source resolution throws", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack({ id: "track-a" as never }));
      storageMock.getAudioUrl.mockReturnValueOnce(
        errAsync(new StorageError(StorageErrorCode.FILE_NOT_FOUND, "gone")),
      );

      const failure = await store.playPlayerTrack(createLibraryTrack({ id: "track-b" as never }))
        .then(() => null, (e: unknown) => e);
      expect(failure).toBeInstanceOf(PlaybackFailure);
      expect((failure as PlaybackFailure).error).toMatchObject({
        kind: "storage",
        cause: { code: StorageErrorCode.FILE_NOT_FOUND },
      });

      // Not stuck in "resolving" with the event filter latched.
      expect(store.playbackState.kind).toBe("error");
      expect(store.player).toBeNull();
      expect(store.currentTrack).toBeNull();
    });

    it("walks a cold start through the same loading states as a switch", async () => {
      const store = usePlayerStore();
      store.currentTrack = createLibraryTrack();
      store.currentTime = 42;
      let finishLoad!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finishLoad = resolve; }),
      );

      const playing = store.play();
      await flushPromises();
      expect(store.playbackState.kind).toBe("loading");
      expect(store.isPlaybackIntended).toBe(true);

      finishLoad();
      await playing;
      expect(store.playbackState.kind).toBe("starting");
      expect(mockPlayerMethods.seek).toHaveBeenCalledWith(42);
    });

    it("returns to idle on dispose", async () => {
      const store = await playingStore();

      await store.dispose();

      expect(store.playbackState.kind).toBe("idle");
      expect(store.status).toBe("idle");
    });
  });

  describe("watchdog", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const parkedResolve = () => {
      let settle!: (url: string) => void;
      storageMock.getAudioUrl.mockImplementationOnce(
        () => new ResultAsync(new Promise((resolve) => { settle = url => resolve(ok(url)); })),
      );
      return (url: string) => settle(url);
    };

    const parkedLoad = () => {
      let finish!: () => void;
      mockPlayerMethods.load.mockImplementationOnce(
        () => new Promise<void>((resolve) => { finish = resolve; }),
      );
      return () => finish();
    };

    const failureOf = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as PlaybackFailure);

    it("gives up on a source that never resolves", async () => {
      const store = usePlayerStore();
      parkedResolve();

      const failure = failureOf(store.playPlayerTrack(createLibraryTrack()));
      await vi.advanceTimersByTimeAsync(14_999);
      expect(store.playbackState.kind).toBe("resolving");

      await vi.advanceTimersByTimeAsync(1);

      expect((await failure)?.error).toEqual({ kind: "timeout", phase: "resolving" });
      expect(store.status).toBe("error");
      expect(store.player).toBeNull();
      // The track stays on screen so the UI can show what failed.
      expect(store.currentTrack).not.toBeNull();
    });

    it("gives up on a load that never finishes and disposes the engine that hung", async () => {
      const store = usePlayerStore();
      parkedLoad();

      const failure = failureOf(store.playPlayerTrack(createLibraryTrack()));
      await vi.advanceTimersByTimeAsync(29_999);
      expect(store.playbackState.kind).toBe("loading");

      await vi.advanceTimersByTimeAsync(1);

      expect((await failure)?.error).toEqual({ kind: "timeout", phase: "loading" });
      expect(store.status).toBe("error");
      // Disposing is what cancels lyra's in-flight load.
      expect(mockPlayerMethods.dispose).toHaveBeenCalledTimes(1);
      expect(store.player).toBeNull();
    });

    it("gives HLS streams a longer leash than local files", async () => {
      const store = usePlayerStore();
      parkedLoad();

      const failure = failureOf(store.playPlayerTrack(createLibraryTrack({
        source: TrackSource.REMOTE_HLS,
        storagePath: "https://example.com/live.m3u8",
      })));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(store.playbackState.kind).toBe("loading");

      await vi.advanceTimersByTimeAsync(30_000);

      expect((await failure)?.error).toEqual({ kind: "timeout", phase: "loading" });
    });

    it("ignores a source that resolves after the deadline", async () => {
      const store = usePlayerStore();
      const settle = parkedResolve();

      const failure = failureOf(store.playPlayerTrack(createLibraryTrack()));
      await vi.advanceTimersByTimeAsync(15_000);
      await failure;

      settle("blob:late");
      await flushPromises();

      expect(mockPlayerMethods.load).not.toHaveBeenCalled();
      expect(store.status).toBe("error");
    });

    it("disarms the deadline once the work completes", async () => {
      const store = usePlayerStore();
      const finish = parkedLoad();

      const playing = store.playPlayerTrack(createLibraryTrack());
      await vi.advanceTimersByTimeAsync(1_000);
      finish();
      await playing;
      (mockPlayer as { trigger: (e: string, ...a: unknown[]) => void })
        .trigger("statechange", { to: "playing" });

      await vi.advanceTimersByTimeAsync(60_000);

      expect(store.status).toBe("playing");
      expect(mockPlayerMethods.dispose).not.toHaveBeenCalled();
    });
  });

  describe("load formats", () => {
    it("loads .m3u8 sources as HLS", async () => {
      const store = usePlayerStore();

      await store.playPlayerTrack(createLibraryTrack({
        source: TrackSource.REMOTE_HLS,
        storagePath: "https://example.com/live.m3u8",
      }));

      expect(mockPlayerMethods.load).toHaveBeenCalledWith({
        url: "https://example.com/live.m3u8",
        type: "hls",
      });
    });

    it("loads ephemeral direct URLs with the CORS fallback", async () => {
      const store = usePlayerStore();
      const radio = {
        kind: "ephemeral",
        id: "radio-1",
        title: "Radio",
        source: { type: "url", url: "https://radio.example/stream.mp3" },
      } as unknown as Parameters<typeof store.playPlayerTrack>[0];

      await store.playPlayerTrack(radio);

      expect(mockPlayerMethods.load).toHaveBeenCalledWith(
        "https://radio.example/stream.mp3",
        { corsFallback: true },
      );
    });
  });
});
