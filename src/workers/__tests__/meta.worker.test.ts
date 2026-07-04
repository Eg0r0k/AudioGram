import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseMetadata } from "../meta.worker";
import { parseBuffer } from "music-metadata";
import type { IAudioMetadata } from "music-metadata";

interface MockOpts {
  title?: string;
  artist?: string | string[];
  album?: string;
  year?: number;
  duration?: number;
  trackNo?: number;
  diskNo?: number;
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  lossless?: boolean;
  channels?: number;
  hasPicture?: boolean;
  replayGainDb?: number;
  replayPeak?: number;
}

function buildMockMetadata(opts: MockOpts, skipCover: boolean): IAudioMetadata {
  const hasPic = (opts.hasPicture ?? false) && !skipCover;

  return {
    format: {
      codec: opts.codec ?? "MP3",
      bitrate: opts.bitrate ?? 320000,
      sampleRate: opts.sampleRate ?? 44100,
      lossless: opts.lossless ?? false,
      numberOfChannels: opts.channels ?? 2,
      duration: opts.duration ?? 200,
      container: "MPEG",
      tagTypes: ["ID3v2.4"],
      trackGain: undefined,
      trackPeakLevel: undefined,
    },
    common: {
      title: opts.title ?? "Test Song",
      artist: opts.artist ?? "Test Artist",
      album: opts.album ?? "Test Album",
      year: opts.year ?? 2024,
      track: { no: opts.trackNo ?? 1, of: 0 },
      disk: { no: opts.diskNo ?? 1, of: 0 },
      picture: hasPic
        ? [{ data: new Uint8Array([1, 2, 3]), format: "image/jpeg", type: "cover", description: "" }]
        : undefined,
      replaygain_track_gain: opts.replayGainDb !== undefined ? { dB: opts.replayGainDb } : undefined,
      replaygain_track_peak: opts.replayPeak !== undefined ? { ratio: opts.replayPeak } : undefined,
      replaygain_track_peak_ratio: undefined,
    },
    native: {},
    quality: { warnings: [] },
  } as unknown as IAudioMetadata;
}

const _mockHelper = { build: buildMockMetadata };
vi.mock("music-metadata", () => ({
  parseBuffer: vi.fn().mockImplementation(
    (_data: Uint8Array, _mime: string | undefined, options: { skipCovers?: boolean } | undefined) =>
      Promise.resolve(_mockHelper.build({ hasPicture: true }, options?.skipCovers ?? false)),
  ),
}));

describe("parseMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("extracts standard metadata fields correctly", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({}, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "song.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      fileId: "test-1",
      meta: {
        title: "Test Song",
        artists: ["Test Artist"],
        album: "Test Album",
        year: 2024,
        duration: 200,
        trackNo: 1,
        diskNo: 1,
        format: {
          codec: "MP3",
          channels: 2,
        },
      },
    });
  });

  it("falls back to filename for missing title", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ title: "" }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "unknown_track.flac",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: { title: "unknown_track" },
    });
  });

  it("returns empty artists when no artist tag", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ artist: "" }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "noartist.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: { artists: [] },
    });
  });

  it("returns empty album when no album tag", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ album: "" }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "noalbum.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: { album: "" },
    });
  });

  it("returns error for invalid data", async () => {
    vi.mocked(parseBuffer).mockRejectedValue(new Error("No valid tags found"));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "corrupt.mp3",
      fileData: new Uint8Array([0xFF, 0xFB]),
    });

    expect(result).toEqual({
      success: false,
      fileId: "test-1",
      error: "No valid tags found",
    });
  });

  it("handles non-Error thrown values", async () => {
    vi.mocked(parseBuffer).mockRejectedValue("string error message");

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "weird.mp3",
      fileData: new Uint8Array([0]),
    });

    expect(result).toEqual({
      success: false,
      fileId: "test-1",
      error: "string error message",
    });
  });

  it("extracts cover when extractCover is true", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ hasPicture: true }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "song.mp3",
      fileData: new Uint8Array([0, 1, 2]),
      extractCover: true,
    });

    expect(result).toMatchObject({
      success: true,
      meta: { pictureBlob: expect.any(Blob) },
    });
  });

  it("skips cover when extractCover is false", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ hasPicture: true }, true));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "song.mp3",
      fileData: new Uint8Array([0, 1, 2]),
      extractCover: false,
    });

    expect(result).toMatchObject({
      success: true,
      meta: { pictureBlob: undefined },
    });
  });

  it("defaults extractCover to true when not specified", async () => {
    await parseMetadata({
      fileId: "test-1",
      fileName: "song.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    const callOptions = vi.mocked(parseBuffer).mock.calls[0][2];
    expect(callOptions?.skipCovers).toBe(false);
  });

  it("skips cover parseBuffer option when extractCover is false", async () => {
    await parseMetadata({
      fileId: "test-1",
      fileName: "song.mp3",
      fileData: new Uint8Array([0, 1, 2]),
      extractCover: false,
    });

    const callOptions = vi.mocked(parseBuffer).mock.calls[0][2];
    expect(callOptions?.skipCovers).toBe(true);
  });

  it("parses artists from semicolon-separated string", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ artist: "Artist A; Artist B" }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "collab.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: { artists: ["Artist A", "Artist B"] },
    });
  });

  it("parses artists from array", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ artist: ["Artist A", "Artist B"] }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "collab.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: { artists: ["Artist A", "Artist B"] },
    });
  });

  it("extracts loudness metadata when replaygain tags present", async () => {
    vi.mocked(parseBuffer).mockResolvedValue(buildMockMetadata({ replayGainDb: -8.5, replayPeak: 0.75 }, false));

    const result = await parseMetadata({
      fileId: "test-1",
      fileName: "loud.mp3",
      fileData: new Uint8Array([0, 1, 2]),
    });

    expect(result).toMatchObject({
      success: true,
      meta: {
        replayGainDb: -8.5,
        replayPeak: 0.75,
        truePeakDbtp: 20 * Math.log10(0.75),
      },
    });
  });
});
