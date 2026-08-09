import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPlayer = {
  currentTrack: null as unknown,
  currentTime: 0,
  sleepAfterCurrentTrack: false,
};
const mockQueue = { next: vi.fn() };
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

import { initPlayerLifecycle } from "../player-lifecycle";
import { playerEvents } from "../lib/player-events";
import { statsService } from "@/services/stats.service";
import type { PlayerTrack } from "../types";

// The emitter is a module-level singleton: register the handlers once, or
// every test would multiply the reactions.
initPlayerLifecycle();

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
    mockPlayer.sleepAfterCurrentTrack = false;
  });

  it("starts a stats session when a library track starts", () => {
    playerEvents.emit("trackChanged", libraryTrack);

    expect(statsService.startListening).toHaveBeenCalledWith(
      "track-1",
      "artist-1",
      "album-1",
      200,
    );
  });

  it("reloads lyrics on every track change, including clears", () => {
    playerEvents.emit("trackChanged", libraryTrack);
    playerEvents.emit("trackChanged", null);

    expect(mockLyrics.loadFor).toHaveBeenNthCalledWith(1, libraryTrack);
    expect(mockLyrics.loadFor).toHaveBeenNthCalledWith(2, null);
  });

  it("does not track stats for cleared playback or ephemeral tracks", () => {
    playerEvents.emit("trackChanged", null);
    playerEvents.emit("trackChanged", { kind: "ephemeral" } as unknown as PlayerTrack);

    expect(statsService.startListening).not.toHaveBeenCalled();
  });

  it("completes stats before advancing the queue on track end", () => {
    mockPlayer.currentTrack = libraryTrack;
    mockPlayer.currentTime = 199;

    playerEvents.emit("trackEnded");

    expect(statsService.stopListening).toHaveBeenCalledWith(199, true);
    expect(mockQueue.next).toHaveBeenCalledTimes(1);

    const stopOrder = vi.mocked(statsService.stopListening).mock.invocationCallOrder[0];
    const nextOrder = mockQueue.next.mock.invocationCallOrder[0];
    expect(stopOrder).toBeLessThan(nextOrder);
  });

  it("consumes the sleep-after-current-track flag on track end", () => {
    mockPlayer.sleepAfterCurrentTrack = true;

    playerEvents.emit("trackEnded");

    expect(mockPlayer.sleepAfterCurrentTrack).toBe(false);
  });

  it("still advances the queue for non-library tracks without touching stats", () => {
    mockPlayer.currentTrack = { kind: "ephemeral" } as unknown as PlayerTrack;

    playerEvents.emit("trackEnded");

    expect(statsService.stopListening).not.toHaveBeenCalled();
    expect(mockQueue.next).toHaveBeenCalledTimes(1);
  });
});
