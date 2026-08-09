import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "../types";

const mockPlayerState = { currentTime: 0 };

vi.mock("../store/player.store", () => ({ usePlayerStore: () => mockPlayerState }));
vi.mock("../service/track-lyrics-loader.service", () => ({
  loadTrackLyrics: vi.fn(),
}));

import { useLyricsStore } from "../store/lyrics.store";
import { loadTrackLyrics } from "../service/track-lyrics-loader.service";

const loader = vi.mocked(loadTrackLyrics);

function createLibraryTrack(): Track {
  return {
    id: "track-1",
    kind: "library",
    title: "Test Track",
  } as unknown as Track;
}

describe("lyrics.store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockPlayerState.currentTime = 0;
  });

  it("starts idle and empty", () => {
    const store = useLyricsStore();

    expect(store.lines).toEqual([]);
    expect(store.status).toBe("idle");
    expect(store.activeLineIndex).toBe(-1);
  });

  it("shows loading for library tracks, then the loader result", async () => {
    const store = useLyricsStore();
    let resolve!: (v: { lines: { time: number; text: string }[]; status: "ready" }) => void;
    loader.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));

    const pending = store.loadFor(createLibraryTrack());
    expect(store.status).toBe("loading");

    resolve({ lines: [{ time: 0, text: "line" }], status: "ready" });
    await pending;

    expect(store.status).toBe("ready");
    expect(store.lines).toHaveLength(1);
  });

  it("clears to idle when playback is cleared", async () => {
    const store = useLyricsStore();
    loader.mockResolvedValueOnce({ lines: [], status: "idle" });

    await store.loadFor(null);

    expect(store.status).toBe("idle");
    expect(store.lines).toEqual([]);
  });

  it("ignores a stale load finishing after a newer one", async () => {
    const store = useLyricsStore();

    let resolveFirst!: (v: { lines: { time: number; text: string }[]; status: "ready" }) => void;
    loader.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));
    const first = store.loadFor(createLibraryTrack());

    loader.mockResolvedValueOnce({ lines: [{ time: 0, text: "new" }], status: "ready" });
    await store.loadFor(createLibraryTrack());

    resolveFirst({ lines: [{ time: 0, text: "stale" }], status: "ready" });
    await first;

    expect(store.lines).toEqual([{ time: 0, text: "new" }]);
  });

  it("tracks the active line against player time", async () => {
    const store = useLyricsStore();
    loader.mockResolvedValueOnce({
      lines: [
        { time: 0, text: "one" },
        { time: 10, text: "two" },
        { time: 20, text: "three" },
      ],
      status: "ready",
    });
    await store.loadFor(createLibraryTrack());

    mockPlayerState.currentTime = 12;
    expect(store.activeLineIndex).toBe(1);
  });
});
