import { err, ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { PlayerTrack, Track } from "../types";
import { loadTrackLyrics } from "../service/track-lyrics-loader.service";
import { fetchLrcLibLyrics } from "../service/lyrics.service";
import { storageService } from "@/db/storage";

vi.mock("@/db/storage", () => ({
  storageService: {
    getFile: vi.fn(),
  },
}));

vi.mock("../service/lyrics.service", () => ({
  fetchLrcLibLyrics: vi.fn(),
}));

function createTrack(overrides: Partial<Track> = {}): Track {
  return {
    kind: "library",
    id: "track-1" as Track["id"],
    title: "Test Track",
    artist: "Test Artist",
    artistIds: ["artist-1" as Track["artistIds"][number]],
    albumId: "album-1" as Track["albumId"],
    albumName: "Test Album",
    storagePath: "tracks/track-1.mp3",
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    duration: 120,
    isLiked: false,
    ...overrides,
  };
}

describe("loadTrackLyrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns idle for non-library tracks", async () => {
    const result = await loadTrackLyrics({
      kind: "ephemeral",
      id: "stream-1",
      title: "Stream",
      source: { type: "url", url: "https://example.com/stream.m3u8" },
    } satisfies PlayerTrack);

    expect(result).toEqual({ lines: [], status: "idle" });
    expect(storageService.getFile).not.toHaveBeenCalled();
    expect(fetchLrcLibLyrics).not.toHaveBeenCalled();
  });

  it("loads and parses attached LRC lyrics", async () => {
    vi.mocked(storageService.getFile).mockResolvedValue(ok(new Blob(["[00:01.00]Hello\n[00:02.50]World"])));

    const result = await loadTrackLyrics(createTrack({ lyricsPath: "lyrics/track-1.lrc" }));

    expect(storageService.getFile).toHaveBeenCalledWith("lyrics/track-1.lrc");
    expect(result).toEqual({
      lines: [
        { time: 1, text: "Hello" },
        { time: 2.5, text: "World" },
      ],
      status: "ready",
    });
    expect(fetchLrcLibLyrics).not.toHaveBeenCalled();
  });

  it("returns error when attached lyrics cannot be read", async () => {
    vi.mocked(storageService.getFile).mockResolvedValue(err(new Error("missing")));

    const result = await loadTrackLyrics(createTrack({ lyricsPath: "lyrics/missing.lrc" }));

    expect(result).toEqual({ lines: [], status: "error" });
  });

  it("falls back to lrclib when no local lyrics are attached", async () => {
    vi.mocked(fetchLrcLibLyrics).mockResolvedValue(ok([{ time: 10, text: "Remote line" }]));

    const result = await loadTrackLyrics(createTrack());

    expect(fetchLrcLibLyrics).toHaveBeenCalledWith("Test Track", "Test Artist");
    expect(result).toEqual({ lines: [{ time: 10, text: "Remote line" }], status: "ready" });
  });

  it("maps lrclib not-found responses to idle", async () => {
    vi.mocked(fetchLrcLibLyrics).mockResolvedValue(err({ type: "NOT_FOUND" }));

    const result = await loadTrackLyrics(createTrack());

    expect(result).toEqual({ lines: [], status: "idle" });
  });

  it("maps lrclib network responses to error", async () => {
    vi.mocked(fetchLrcLibLyrics).mockResolvedValue(err({ type: "NETWORK", cause: new Error("offline") }));

    const result = await loadTrackLyrics(createTrack());

    expect(result).toEqual({ lines: [], status: "error" });
  });
});
