import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPlayer = {
  currentTrack: null as unknown,
  currentTime: 0,
  listenedSeconds: 0,
  getListenedSeconds: () => mockPlayer.listenedSeconds,
  sleepAfterCurrentTrack: false,
};
const mockQueue = { advance: vi.fn() };
const mockLyrics = { loadFor: vi.fn() };

vi.mock("../store/player.store", () => ({ usePlayerStore: () => mockPlayer }));
vi.mock("../store/lyrics.store", () => ({ useLyricsStore: () => mockLyrics }));
vi.mock("@/modules/queue/store/queue.store", () => ({ useQueueStore: () => mockQueue }));
vi.mock("@/services/stats.service", () => ({
  statsService: {
    startListening: vi.fn(),
    stopListening: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
const mockToast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }));
vi.mock("vue-sonner", () => ({ toast: mockToast }));
vi.mock("@/app/i18n", () => ({
  i18n: { global: { t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key) } },
}));
vi.mock("../lib/prefetch-next", () => ({ initNextTrackPrefetch: vi.fn(() => () => {}) }));

import { useEventBus } from "@vueuse/core";
import { initPlayerLifecycle } from "../player-lifecycle";
import { trackChangedEvent, trackEndedEvent } from "../lib/player-events";
import { playbackStalledEvent, trackSkippedEvent } from "@/modules/queue/lib/queue-events";
import { TrackSource } from "@/db/entities";
import { StorageError, StorageErrorCode } from "@/db/errors/storage.errors";
import { initNextTrackPrefetch } from "../lib/prefetch-next";
import { statsService } from "@/services/stats.service";
import type { PlayerTrack } from "../types";

// The event bus registry is global: register the handlers once, or every
// test would multiply the reactions.
initPlayerLifecycle();

// Captured before the per-test clearAllMocks wipes the call record.
const prefetchInitCalls = vi.mocked(initNextTrackPrefetch).mock.calls.length;

const trackChangedBus = useEventBus(trackChangedEvent);
const trackEndedBus = useEventBus(trackEndedEvent);

const libraryTrack = {
  kind: "library",
  id: "track-1",
  artistIds: ["artist-1"],
  albumId: "album-1",
  duration: 200,
} as unknown as PlayerTrack;

describe("player lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlayer.currentTrack = null;
    mockPlayer.currentTime = 0;
    mockPlayer.listenedSeconds = 0;
    mockPlayer.sleepAfterCurrentTrack = false;
  });

  it("wires the next-track prefetch watcher exactly once at init", () => {
    expect(prefetchInitCalls).toBe(1);
  });

  it("starts a stats session when a library track starts", () => {
    trackChangedBus.emit(libraryTrack);

    expect(statsService.startListening).toHaveBeenCalledWith(
      "track-1",
      "artist-1",
      "album-1",
      200,
    );
  });

  it("reloads lyrics on every track change, including clears", () => {
    trackChangedBus.emit(libraryTrack);
    trackChangedBus.emit(null);

    expect(mockLyrics.loadFor).toHaveBeenNthCalledWith(1, libraryTrack);
    expect(mockLyrics.loadFor).toHaveBeenNthCalledWith(2, null);
  });

  it("does not track stats for cleared playback or ephemeral tracks", () => {
    trackChangedBus.emit(null);
    trackChangedBus.emit({ kind: "ephemeral" } as unknown as PlayerTrack);

    expect(statsService.startListening).not.toHaveBeenCalled();
  });

  it("completes stats before advancing the queue on track end", () => {
    mockPlayer.currentTrack = libraryTrack;
    // The store zeroes currentTime before emitting trackEnded — the stop must
    // consume the accumulated listened seconds, never the time ref.
    mockPlayer.currentTime = 0;
    mockPlayer.listenedSeconds = 199;

    trackEndedBus.emit();

    expect(statsService.stopListening).toHaveBeenCalledWith(199, { completed: true });
    expect(mockQueue.advance).toHaveBeenCalledTimes(1);

    const stopOrder = vi.mocked(statsService.stopListening).mock.invocationCallOrder[0];
    const nextOrder = mockQueue.advance.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(nextOrder);
  });

  it("consumes the sleep-after-current-track flag on track end", () => {
    mockPlayer.sleepAfterCurrentTrack = true;

    trackEndedBus.emit();

    expect(mockPlayer.sleepAfterCurrentTrack).toBe(false);
  });

  it("tells the user about a skipped track, except for quiet storage failures", () => {
    const bus = useEventBus(trackSkippedEvent);
    const track = { ...libraryTrack, title: "Song", source: TrackSource.LOCAL_INTERNAL } as unknown as PlayerTrack;

    bus.emit({ track, error: { kind: "source", cause: { kind: "NETWORK", message: "down" } } });
    expect(mockToast.warning).toHaveBeenLastCalledWith('queue.trackSkipped:{"title":"Song"}');

    bus.emit({ track, error: { kind: "storage", cause: StorageError.readFailed("/x") } });
    expect(mockToast.warning).toHaveBeenCalledTimes(1);
  });

  it("points at the watched folder when its file is gone", () => {
    const track = { ...libraryTrack, title: "Song", source: TrackSource.LOCAL_EXTERNAL } as unknown as PlayerTrack;

    useEventBus(trackSkippedEvent).emit({
      track,
      error: { kind: "storage", cause: new StorageError(StorageErrorCode.FILE_NOT_FOUND, "gone") },
    });

    expect(mockToast.warning).toHaveBeenLastCalledWith("watchedFolders.trackPathMissing");
  });

  it("reports a stalled queue as an error", () => {
    useEventBus(playbackStalledEvent).emit({
      track: libraryTrack,
      error: { kind: "timeout", phase: "loading" },
      failures: 3,
    });

    expect(mockToast.error).toHaveBeenCalledWith('queue.playbackStalled:{"count":3}');
  });

  it("still advances the queue for non-library tracks without touching stats", () => {
    mockPlayer.currentTrack = { kind: "ephemeral" } as unknown as PlayerTrack;

    trackEndedBus.emit();

    expect(statsService.stopListening).not.toHaveBeenCalled();
    expect(mockQueue.advance).toHaveBeenCalledTimes(1);
  });
});
