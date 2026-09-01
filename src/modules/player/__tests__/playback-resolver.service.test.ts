import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, okAsync, errAsync } from "neverthrow";
import { TrackSource, TrackState } from "@/db/entities";
import { StorageError } from "@/db/errors/storage.errors";
import type { Track } from "../types";

const storageMock = vi.hoisted(() => ({ getAudioUrl: vi.fn() }));
const offlineCopyMock = vi.hoisted(() => ({ findById: vi.fn() }));
const sourcesMock = vi.hoisted(() => ({ forTrack: vi.fn() }));
const platformMock = vi.hoisted(() => ({ hasFs: true }));
const ensurePinnedMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/db/repositories", () => ({ offlineCopyRepository: offlineCopyMock }));
vi.mock("@/modules/sources", () => ({ sources: sourcesMock }));
vi.mock("@/lib/environment/platformCaps", () => ({ platformCaps: platformMock }));
vi.mock("@/modules/tracks/service/ensurePinned", () => ({ ensurePinned: ensurePinnedMock }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));

import {
  PlaybackFailure,
  checkPlayable,
  describePlaybackError,
  isStreamingTrack,
  resolvePlaybackSource,
  toPlaybackFailure,
} from "../service/playback-resolver.service";

const libraryTrack = (overrides: Partial<Track> = {}): Track => ({
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
});

describe("playback-resolver.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformMock.hasFs = true;
    storageMock.getAudioUrl.mockReturnValue(okAsync("blob:audio"));
    offlineCopyMock.findById.mockResolvedValue(ok(undefined));
  });

  describe("library tracks", () => {
    it("resolves a local file through storage", async () => {
      const result = await resolvePlaybackSource(libraryTrack());

      expect(result._unsafeUnwrap()).toEqual({ kind: "url", url: "blob:audio" });
      expect(storageMock.getAudioUrl).toHaveBeenCalledWith("/path/to/track.mp3");
    });

    it("types a storage failure", async () => {
      const cause = StorageError.fileNotFound("/path/to/track.mp3");
      storageMock.getAudioUrl.mockReturnValue(errAsync(cause));

      const result = await resolvePlaybackSource(libraryTrack());

      expect(result._unsafeUnwrapErr()).toEqual({ kind: "storage", cause });
    });

    it("refuses an external file without a native FS", async () => {
      platformMock.hasFs = false;

      const result = await resolvePlaybackSource(libraryTrack({ source: TrackSource.LOCAL_EXTERNAL }));

      expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "unavailable" });
      expect(storageMock.getAudioUrl).not.toHaveBeenCalled();
    });

    it("plays an HLS track's stream URL as HLS", async () => {
      const result = await resolvePlaybackSource(libraryTrack({
        source: TrackSource.REMOTE_HLS,
        storagePath: "https://example.com/live.m3u8",
      }));

      expect(result._unsafeUnwrap()).toEqual({ kind: "hls", url: "https://example.com/live.m3u8" });
    });

    it("refuses an HLS track with no stream URL", async () => {
      const result = await resolvePlaybackSource(libraryTrack({
        source: TrackSource.REMOTE_HLS,
        storagePath: "",
      }));

      expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "unavailable" });
    });
  });

  describe("remote tracks", () => {
    const remote = () => libraryTrack({ id: "yt:abc" as never, source: TrackSource.REMOTE_YT, storagePath: "" });

    it("prefers the offline copy over the source stream", async () => {
      offlineCopyMock.findById.mockResolvedValue(ok({ trackId: "yt:abc", storagePath: "offline/yt/abc.m4a" }));

      const result = await resolvePlaybackSource(remote());

      expect(result._unsafeUnwrap()).toEqual({ kind: "url", url: "blob:audio" });
      expect(storageMock.getAudioUrl).toHaveBeenCalledWith("offline/yt/abc.m4a");
      expect(sourcesMock.forTrack).not.toHaveBeenCalled();
    });

    it("falls back to the source stream, even when the copy lookup itself fails", async () => {
      offlineCopyMock.findById.mockResolvedValue(errAsync(new Error("idb down")));
      sourcesMock.forTrack.mockReturnValue({ resolveStreamUrl: vi.fn(() => okAsync("http://127.0.0.1:60123/deadbeef/yt/abc")) });

      const result = await resolvePlaybackSource(remote());

      expect(result._unsafeUnwrap()).toEqual({ kind: "url", url: "http://127.0.0.1:60123/deadbeef/yt/abc" });
      expect(storageMock.getAudioUrl).not.toHaveBeenCalled();
    });

    it("types a source failure", async () => {
      const cause = { kind: "NETWORK" as const, message: "upstream down" };
      sourcesMock.forTrack.mockReturnValue({ resolveStreamUrl: vi.fn(() => errAsync(cause)) });

      const result = await resolvePlaybackSource(remote());

      expect(result._unsafeUnwrapErr()).toEqual({ kind: "source", cause });
    });

    it("shadow-pins a track played from live browsing without waiting for it", async () => {
      sourcesMock.forTrack.mockReturnValue({ resolveStreamUrl: vi.fn(() => okAsync("stream://x")) });
      let releasePin!: () => void;
      ensurePinnedMock.mockImplementation(() => new Promise<void>((resolve) => { releasePin = resolve; }));
      const dto = { id: "yt:abc" } as never;

      const result = await resolvePlaybackSource(libraryTrack({
        id: "yt:abc" as never, source: TrackSource.REMOTE_YT, storagePath: "", sourceDto: dto,
      }));

      expect(result.isOk()).toBe(true);
      expect(ensurePinnedMock).toHaveBeenCalledWith({ kind: "remote", dto }, { pinned: 0 });
      releasePin();
    });
  });

  describe("ephemeral tracks", () => {
    it("hands a dropped file to the engine as-is", async () => {
      const file = new File(["x"], "a.mp3");

      const result = await resolvePlaybackSource({
        kind: "ephemeral", id: "e1", title: "Drop", source: { type: "file", file },
      });

      expect(result._unsafeUnwrap()).toEqual({ kind: "file", file });
    });

    it("refuses a file handle that did not survive persistence", async () => {
      const result = await resolvePlaybackSource({
        kind: "ephemeral", id: "e1", title: "Drop", source: { type: "file", file: {} as File },
      });

      expect(result._unsafeUnwrapErr()).toMatchObject({ kind: "unavailable" });
    });

    it("resolves a native path through storage, and refuses it without a FS", async () => {
      const track = { kind: "ephemeral" as const, id: "e2", title: "Open with", source: { type: "path" as const, path: "C:/x.flac" } };

      expect((await resolvePlaybackSource(track))._unsafeUnwrap()).toEqual({ kind: "url", url: "blob:audio" });

      platformMock.hasFs = false;
      expect((await resolvePlaybackSource(track))._unsafeUnwrapErr()).toMatchObject({ kind: "unavailable" });
    });

    it("plays a direct URL with the CORS fallback and recognises HLS by its URL", async () => {
      const radio = await resolvePlaybackSource({
        kind: "ephemeral", id: "r", title: "Radio", source: { type: "url", url: "https://radio.example/stream.mp3" },
      });
      const hls = await resolvePlaybackSource({
        kind: "ephemeral", id: "h", title: "HLS", source: { type: "url", url: "https://radio.example/live.m3u8" },
      });

      expect(radio._unsafeUnwrap()).toEqual({ kind: "url", url: "https://radio.example/stream.mp3", corsFallback: true });
      expect(hls._unsafeUnwrap()).toEqual({ kind: "hls", url: "https://radio.example/live.m3u8" });
    });
  });

  describe("helpers", () => {
    it("checkPlayable refuses broken library tracks only", () => {
      expect(checkPlayable(libraryTrack({ state: TrackState.BROKEN }))._unsafeUnwrapErr())
        .toEqual({ kind: "broken", trackId: "track-1" });
      expect(checkPlayable(libraryTrack()).isOk()).toBe(true);
      expect(checkPlayable({ kind: "ephemeral", id: "e", title: "E", source: { type: "url", url: "u" } }).isOk()).toBe(true);
    });

    it("isStreamingTrack flags radio URLs and HLS library tracks", () => {
      expect(isStreamingTrack({ kind: "ephemeral", id: "e", title: "E", source: { type: "url", url: "u" } })).toBe(true);
      expect(isStreamingTrack(libraryTrack({ source: TrackSource.REMOTE_HLS }))).toBe(true);
      expect(isStreamingTrack(libraryTrack())).toBe(false);
      expect(isStreamingTrack({ kind: "ephemeral", id: "e", title: "E", source: { type: "file", file: new File([], "a") } })).toBe(false);
    });

    it("keeps the historical messages for each failure kind", () => {
      const track = libraryTrack();
      expect(describePlaybackError({ kind: "broken", trackId: "track-1" }, track))
        .toBe('Track is marked as broken: "Test Track"');
      expect(describePlaybackError({ kind: "source", cause: { kind: "NETWORK", message: "upstream down" } }, track))
        .toBe("[NETWORK] upstream down");
      expect(describePlaybackError({ kind: "engine", cause: new Error("decode failed") }, track))
        .toBe("decode failed");
      expect(describePlaybackError({ kind: "timeout", phase: "loading" }, track))
        .toBe('Timed out while loading "Test Track"');
    });

    it("toPlaybackFailure passes typed failures through and wraps anything else as an engine error", () => {
      const track = libraryTrack();
      const typed = new PlaybackFailure({ kind: "broken", trackId: "track-1" }, track);

      expect(toPlaybackFailure(typed, track)).toBe(typed);
      expect(toPlaybackFailure(new Error("boom"), track).error).toMatchObject({ kind: "engine", cause: { message: "boom" } });
      expect(toPlaybackFailure("boom", track).error).toMatchObject({ kind: "engine", cause: { message: "boom" } });
    });
  });
});
