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

vi.mock("@/db/storage", () => ({
  storageService: {
    getAudioUrl: () => Promise.resolve({ isOk: () => true, isErr: () => false, value: "blob:mock-audio-url" }),
    getFile: () => Promise.resolve({ isErr: () => true }),
  },
}));

vi.mock("@/services/stats.service", () => ({
  statsService: {
    stopListening: () => Promise.resolve(null),
    startListening: () => {},
  },
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

import { useEventBus } from "@vueuse/core";
import { usePlayerStore } from "../store/player.store";
import { trackEndedEvent } from "../lib/player-events";

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

    it("should compute canPlay when player is ready", () => {
      const store = usePlayerStore();
      store.player = { isReady: true } as unknown as NonNullable<typeof store.player>;
      expect(store.canPlay).toBe(true);
    });

    it("should compute canPlay when player is not ready", () => {
      const store = usePlayerStore();
      store.player = { isReady: false } as unknown as NonNullable<typeof store.player>;
      expect(store.canPlay).toBe(false);
    });

    it("should compute canPlay when player is null", () => {
      const store = usePlayerStore();
      expect(store.canPlay).toBe(false);
    });

    it("should compute canSeek correctly", () => {
      const store = usePlayerStore();

      store.player = {} as NonNullable<typeof store.player>;
      store.duration = 100;
      expect(store.canSeek).toBe(true);

      store.duration = 0;
      expect(store.canSeek).toBe(false);
    });

    it("should not allow seek when player is null", () => {
      const store = usePlayerStore();
      expect(store.canSeek).toBe(false);
    });

    it("should not allow seek for live streams", () => {
      const store = usePlayerStore();
      store.player = {} as NonNullable<typeof store.player>;
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

    it("should call player method when setVolume", () => {
      const store = usePlayerStore();
      const mockSetVolumeFn = vi.fn();
      store.player = { setVolume: mockSetVolumeFn } as unknown as NonNullable<typeof store.player>;

      store.setVolume(0.8);
      expect(mockSetVolumeFn).toHaveBeenCalledWith(0.8);
    });

    it("should call player method when setMuted", () => {
      const store = usePlayerStore();
      const mockSetMutedFn = vi.fn();
      store.player = { setMuted: mockSetMutedFn } as unknown as NonNullable<typeof store.player>;

      store.setMuted(true);
      expect(mockSetMutedFn).toHaveBeenCalledWith(true);
    });

    it("should call player toggleMute", () => {
      const store = usePlayerStore();
      const mockToggleMuteFn = vi.fn();
      store.player = { toggleMute: mockToggleMuteFn } as unknown as NonNullable<typeof store.player>;

      store.toggleMute();
      expect(mockToggleMuteFn).toHaveBeenCalled();
    });
  });

  describe("seek controls", () => {
    it("should seek to specific time when allowed", () => {
      const store = usePlayerStore();
      const mockSeekFn = vi.fn();
      store.player = { seek: mockSeekFn } as unknown as NonNullable<typeof store.player>;
      store.duration = 100;

      store.seekTo(50);
      expect(mockSeekFn).toHaveBeenCalledWith(50);
    });

    it("should not seek when canSeek is false", () => {
      const store = usePlayerStore();
      const mockSeekFn = vi.fn();
      store.player = { seek: mockSeekFn } as unknown as NonNullable<typeof store.player>;
      store.duration = 0;

      store.seekTo(50);
      expect(mockSeekFn).not.toHaveBeenCalled();
    });

    it("should not seek when player is null", () => {
      const store = usePlayerStore();
      const mockSeekFn = vi.fn();

      store.seekTo(50);
      expect(mockSeekFn).not.toHaveBeenCalled();
    });

    it("should seek by percent", () => {
      const store = usePlayerStore();
      const mockSeekPercentFn = vi.fn();
      store.player = { seekPercent: mockSeekPercentFn } as unknown as NonNullable<typeof store.player>;
      store.duration = 100;

      store.seekPercent(50);
      expect(mockSeekPercentFn).toHaveBeenCalledWith(0.5);
    });

    it("should not seekPercent when canSeek is false", () => {
      const store = usePlayerStore();
      const mockSeekPercentFn = vi.fn();
      store.player = { seekPercent: mockSeekPercentFn } as unknown as NonNullable<typeof store.player>;
      store.duration = 0;

      store.seekPercent(50);
      expect(mockSeekPercentFn).not.toHaveBeenCalled();
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
    it("should stop player and reset time when player exists", () => {
      const store = usePlayerStore();
      const mockStopFn = vi.fn();
      store.player = {
        stop: mockStopFn,
        fadeOut: vi.fn().mockResolvedValue(undefined),
      } as unknown as NonNullable<typeof store.player>;
      store.currentTime = 50;

      store.stop();
      expect(mockStopFn).toHaveBeenCalled();
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

      await expect(store.playPlayerTrack(brokenTrack)).rejects.toThrow(
        'Track is marked as broken: "Test Track"',
      );
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

      // Track A's load hangs (slow remote stream, e.g. ytstream:// via proxy).
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

  describe("dispose functionality", () => {
    it("should dispose player when player exists", async () => {
      const store = usePlayerStore();
      const mockDisposeFn = vi.fn().mockResolvedValue(undefined);
      store.player = { dispose: mockDisposeFn } as unknown as NonNullable<typeof store.player>;

      await store.dispose();

      expect(mockDisposeFn).toHaveBeenCalled();
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
      const mockPauseFn = vi.fn();

      store.player = { pause: mockPauseFn } as unknown as NonNullable<typeof store.player>;
      store.status = "playing";

      store.setSleepTimer(5 * 1000);
      await nextTick();
      vi.advanceTimersByTime(5000);

      expect(mockPauseFn).toHaveBeenCalledTimes(1);
      expect(store.isSleepTimerActive).toBe(false);
      expect(store.sleepTimerRemainingMs).toBe(0);
    });

    it("should clear sleep timer on dispose", async () => {
      const store = usePlayerStore();
      const mockDisposeFn = vi.fn().mockResolvedValue(undefined);

      store.player = { dispose: mockDisposeFn } as unknown as NonNullable<typeof store.player>;
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

    it("should return graph when player exists", () => {
      const store = usePlayerStore();
      const mockGraph = {};
      store.player = { graph: mockGraph } as unknown as NonNullable<typeof store.player>;

      expect(store.getAudioGraph()).toBe(mockGraph);
    });

    it("should return null when graph is undefined", () => {
      const store = usePlayerStore();
      store.player = { graph: undefined } as unknown as NonNullable<typeof store.player>;

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
      // A buffering blip can flip status back while the fade is in flight.
      store.status = "playing";
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

    it("ignores events from a superseded player", async () => {
      const store = usePlayerStore();
      await store.playPlayerTrack(createLibraryTrack());
      const stale = engine();

      // A newer request took over and dropped this engine instance.
      store.player = null;

      stale.trigger("statechange", { to: "playing" });
      stale.trigger("timeupdate", { currentTime: 42 });

      expect(store.status).not.toBe("playing");
      expect(store.currentTime).toBe(0);
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
  });

  describe("playPlayerTrack error handling", () => {
    it("marks error state and rethrows when the engine load fails", async () => {
      const store = usePlayerStore();
      mockPlayerMethods.load.mockRejectedValueOnce(new Error("decode failed"));

      await expect(store.playPlayerTrack(createLibraryTrack())).rejects.toThrow("decode failed");

      expect(store.status).toBe("error");
      expect(store.player).toBeNull();
      // Non-storage errors keep the track so the UI can show what failed.
      expect(store.currentTrack).not.toBeNull();
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
