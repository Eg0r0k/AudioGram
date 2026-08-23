/**
 * Behavioural coverage for {@link ImportPipeline}.
 *
 * The pipeline's byte access and tag parsing are injected, so they are faked
 * here; everything below them (validation, dedup, batching, cancellation,
 * error isolation, persistence via the real EntityResolver/persistTracks) runs
 * for real against mocked repositories.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportPipeline } from "../import/import-pipeline";
import { DB_BATCH_SIZE, PIPELINE_BATCH_SIZE } from "../import/constants";
import { extensionOf, itemsFromFiles, itemsFromPaths } from "../import/item-io";
import { ImportErrorCode, type ImportControl, type ImportItem } from "../types";
import type { ImportItemIO } from "../import/item-io";
import type { MetadataParser } from "../import/metadata-parser";
import type { BaseMetadata } from "@/workers/types";

const {
  mockGetAllFingerprints,
  mockUnitOfWorkRunScoped,
  mockTrackCreateMany,
  mockArtistCreateMany,
  mockAlbumCreateMany,
  mockCoverCreateMany,
} = vi.hoisted(() => ({
  mockGetAllFingerprints: vi.fn(),
  mockUnitOfWorkRunScoped: vi.fn(),
  mockTrackCreateMany: vi.fn(),
  mockArtistCreateMany: vi.fn(),
  mockAlbumCreateMany: vi.fn(),
  mockCoverCreateMany: vi.fn(),
}));

function okResult<T>(value: T) {
  return { isOk: () => true, isErr: () => false, value };
}

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/db/repositories", () => ({
  trackRepository: {
    getAllFingerprints: mockGetAllFingerprints,
    createMany: mockTrackCreateMany,
    findByIds: vi.fn().mockResolvedValue(okResult([])),
  },
  artistRepository: {
    findByIds: vi.fn().mockResolvedValue(okResult([])),
    createMany: mockArtistCreateMany,
  },
  albumRepository: {
    findByIds: vi.fn().mockResolvedValue(okResult([])),
    createMany: mockAlbumCreateMany,
  },
  coverRepository: { createMany: mockCoverCreateMany },
}));

vi.mock("@/db/unit-of-work", () => ({
  unitOfWork: { runScoped: mockUnitOfWorkRunScoped },
}));

vi.mock("@/db", () => {
  const chain = {
    equals: vi.fn().mockReturnThis(),
    anyOf: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  };
  return {
    db: {
      artists: { where: vi.fn().mockReturnValue(chain), toArray: vi.fn().mockResolvedValue([]) },
      albums: { where: vi.fn().mockReturnValue(chain) },
      tracks: { where: vi.fn().mockReturnValue(chain) },
      covers: {},
    },
  };
});

// ── Fakes ───────────────────────────────────────────────────────

function makeMeta(overrides: Partial<BaseMetadata> = {}): BaseMetadata {
  return {
    title: "Title",
    artists: ["Artist"],
    album: "Album",
    year: 2024,
    duration: 100,
    trackNo: 1,
    diskNo: 1,
    format: { codec: "MP3", bitrate: 320000, sampleRate: 44100, lossless: false, channels: 2 },
    ...overrides,
  };
}

interface Fakes {
  itemIO: ImportItemIO;
  parser: MetadataParser;
  computeFingerprint: ReturnType<typeof vi.fn>;
  readHeadBytes: ReturnType<typeof vi.fn>;
  copyToStorage: ReturnType<typeof vi.fn>;
  parse: ReturnType<typeof vi.fn>;
}

/** Fingerprints default to a per-name value so distinct names never collide. */
function makeFakes(): Fakes {
  const computeFingerprint = vi.fn(async (item: ImportItem) => `fp:${item.name}`);
  const readHeadBytes = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const copyToStorage = vi.fn(async () => undefined);
  const parse = vi.fn(async (name: string) => makeMeta({ title: name }));

  return {
    computeFingerprint,
    readHeadBytes,
    copyToStorage,
    parse,
    itemIO: { computeFingerprint, readHeadBytes, copyToStorage } as unknown as ImportItemIO,
    parser: { parse } as unknown as MetadataParser,
  };
}

function makePipeline(fakes: Fakes, onTracksImported?: (ids: string[]) => void) {
  return new ImportPipeline({
    itemIO: fakes.itemIO,
    metadataParser: fakes.parser,
    onTracksImported: onTracksImported as never,
  });
}

function webItem(name: string, type = ""): ImportItem {
  return { type: "web", name, ext: extensionOf(name), file: new File([""], name, { type }), fileSize: 10 };
}

function nativeItems(...names: string[]): ImportItem[] {
  return itemsFromPaths(names.map(n => `/music/${n}`));
}

// ── Suite ───────────────────────────────────────────────────────

describe("ImportPipeline", () => {
  let fakes: Fakes;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllFingerprints.mockResolvedValue(okResult(new Set<string>()));
    mockTrackCreateMany.mockResolvedValue(okResult([]));
    mockArtistCreateMany.mockResolvedValue(okResult([]));
    mockAlbumCreateMany.mockResolvedValue(okResult([]));
    mockCoverCreateMany.mockResolvedValue(okResult([]));
    mockUnitOfWorkRunScoped.mockImplementation(async (_tables: unknown, cb: () => Promise<void>) => {
      await cb();
      return okResult(undefined);
    });
    fakes = makeFakes();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Format / extension handling ───────────────────────────────

  describe("extension handling", () => {
    const SUPPORTED = ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "webm"];

    it.each(SUPPORTED)("imports a .%s file", async (ext) => {
      const result = await makePipeline(fakes).run(nativeItems(`song.${ext}`));

      expect(result.failed).toHaveLength(0);
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0].fileName).toBe(`song.${ext}`);
    });

    it.each(["MP3", "FLAC", "OpUs", "M4A"])("accepts the uppercase extension .%s", async (ext) => {
      const result = await makePipeline(fakes).run(nativeItems(`song.${ext}`));

      expect(result.failed).toHaveLength(0);
      expect(result.successful).toHaveLength(1);
    });

    it("lowercases the extension in the managed storage path", async () => {
      await makePipeline(fakes).run(nativeItems("song.FLAC"));

      expect(fakes.copyToStorage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^tracks\/[\w-]+\.flac$/),
      );
    });

    it("uses the last segment of a multi-dot file name as the extension", async () => {
      const result = await makePipeline(fakes).run(nativeItems("The.Album.-.01.Song.flac"));

      expect(result.successful).toHaveLength(1);
      expect(fakes.copyToStorage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/\.flac$/),
      );
    });

    it.each([
      ["notes.txt", "a text file"],
      ["installer.exe", "an executable"],
      ["clip.mp4", "a video container"],
      ["cover.jpg", "an image"],
      ["archive.mp3.zip", "an archived audio file"],
    ])("rejects %s (%s) as an unsupported format", async (name) => {
      const result = await makePipeline(fakes).run(nativeItems(name));

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.UNSUPPORTED_FORMAT);
      expect(fakes.parse).not.toHaveBeenCalled();
    });

    it("rejects a file with no extension and no MIME type", async () => {
      const result = await makePipeline(fakes).run([webItem("song")]);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.UNSUPPORTED_FORMAT);
    });

    it("accepts a file with no extension when its MIME type is audio", async () => {
      const result = await makePipeline(fakes).run([webItem("song", "audio/mpeg")]);

      expect(result.successful).toHaveLength(1);
    });

    it("gives a MIME-only file a real storage extension instead of the file name", async () => {
      await makePipeline(fakes).run([webItem("song", "audio/flac")]);

      // Regression guard: `tracks/<uuid>.song` is not a usable audio path.
      expect(fakes.copyToStorage).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.stringContaining(".song"),
      );
    });

    it("accepts an extension-less content:// item and sniffs its storage extension", async () => {
      const item: ImportItem = {
        type: "native",
        name: "audio%3A42",
        ext: "",
        path: "content://media/external/audio/media/42",
        fileSize: 0,
      };
      fakes.readHeadBytes.mockResolvedValue(new Uint8Array([0x66, 0x4C, 0x61, 0x43]));

      const result = await makePipeline(fakes).run([item]);

      expect(result.successful).toHaveLength(1);
      expect(fakes.copyToStorage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^tracks\/.+\.flac$/),
      );
    });

    it("keeps processing the supported files in a mixed batch", async () => {
      const result = await makePipeline(fakes).run(
        nativeItems("a.mp3", "readme.txt", "b.flac", "photo.png", "c.wav"),
      );

      expect(result.successful).toHaveLength(3);
      expect(result.failed).toHaveLength(2);
      expect(result.total).toBe(5);
    });
  });

  // ── Deduplication ─────────────────────────────────────────────

  describe("deduplication", () => {
    it("skips a file whose fingerprint is already in the library", async () => {
      mockGetAllFingerprints.mockResolvedValue(okResult(new Set(["fp:dup.mp3"])));

      const result = await makePipeline(fakes).run(nativeItems("dup.mp3"));

      expect(result.skipped).toBe(1);
      expect(result.successful).toHaveLength(0);
      expect(fakes.parse).not.toHaveBeenCalled();
    });

    it("keeps only the first of two files sharing a fingerprint", async () => {
      fakes.computeFingerprint.mockResolvedValue("same-fp");

      const result = await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3"));

      expect(result.successful).toHaveLength(1);
      expect(result.skipped).toBe(1);
    });

    it("skips the same native path listed twice", async () => {
      const result = await makePipeline(fakes).run(
        itemsFromPaths(["/music/song.mp3", "/music/song.mp3"]),
      );

      expect(result.successful).toHaveLength(1);
      expect(result.skipped).toBe(1);
    });

    it("treats identical names in different folders as distinct files", async () => {
      const result = await makePipeline(fakes).run(
        itemsFromPaths(["/music/a/song.mp3", "/music/b/song.mp3"]),
      );

      expect(result.skipped).toBe(1); // same name → same fake fingerprint
      expect(fakes.computeFingerprint).toHaveBeenCalledTimes(2);
    });

    it("dedupes across pipeline batches, not just within one", async () => {
      fakes.computeFingerprint.mockResolvedValue("shared-fp");
      const items = nativeItems(
        ...Array.from({ length: PIPELINE_BATCH_SIZE + 10 }, (_, i) => `s${i}.mp3`),
      );

      const result = await makePipeline(fakes).run(items);

      expect(result.successful).toHaveLength(1);
      expect(result.skipped).toBe(PIPELINE_BATCH_SIZE + 9);
    });

    it("imports a file whose fingerprint could not be computed", async () => {
      fakes.computeFingerprint.mockResolvedValue(null);

      const result = await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3"));

      expect(result.successful).toHaveLength(2);
      expect(result.skipped).toBe(0);
    });

    it("does not dedupe unfingerprinted files against each other", async () => {
      fakes.computeFingerprint.mockResolvedValue(null);

      const result = await makePipeline(fakes).run(
        itemsFromFiles([new File([""], "a.mp3"), new File([""], "a.mp3")]),
      );

      expect(result.successful).toHaveLength(2);
    });
  });

  // ── Batching ──────────────────────────────────────────────────

  describe("batching", () => {
    it("persists in DB-sized transactions", async () => {
      const count = DB_BATCH_SIZE * 2 + 5;
      const items = nativeItems(...Array.from({ length: count }, (_, i) => `s${i}.mp3`));

      const result = await makePipeline(fakes).run(items);

      expect(result.successful).toHaveLength(count);
      // 100-item pipeline batch → 2 transactions, then 5 → 1 more.
      expect(mockUnitOfWorkRunScoped).toHaveBeenCalledTimes(3);
    });

    it("processes more items than one pipeline batch", async () => {
      const count = PIPELINE_BATCH_SIZE * 2 + 1;
      const items = nativeItems(...Array.from({ length: count }, (_, i) => `s${i}.mp3`));

      const result = await makePipeline(fakes).run(items);

      expect(result.successful).toHaveLength(count);
      expect(result.total).toBe(count);
    });

    it("accounts for every item exactly once", async () => {
      const items = [
        ...nativeItems(...Array.from({ length: 30 }, (_, i) => `ok${i}.mp3`)),
        ...nativeItems("bad.txt", "bad2.doc"),
      ];
      mockGetAllFingerprints.mockResolvedValue(okResult(new Set(["fp:ok0.mp3"])));

      const result = await makePipeline(fakes).run(items);

      expect(result.successful.length + result.failed.length + result.skipped)
        .toBe(result.total);
    });

    it("returns an empty result for an empty input", async () => {
      const result = await makePipeline(fakes).run([]);

      expect(result).toMatchObject({ successful: [], failed: [], skipped: 0, total: 0 });
      expect(mockUnitOfWorkRunScoped).not.toHaveBeenCalled();
    });
  });

  // ── Progress ──────────────────────────────────────────────────

  describe("progress reporting", () => {
    it("reports 0/total before doing any work", async () => {
      const onProgress = vi.fn();

      await makePipeline(fakes).run(nativeItems("a.mp3"), onProgress);

      expect(onProgress).toHaveBeenNthCalledWith(1, 0, 1);
    });

    it("never moves backwards and ends at total", async () => {
      const items = nativeItems(...Array.from({ length: 250 }, (_, i) => `s${i}.mp3`));
      const seen: number[] = [];

      await makePipeline(fakes).run(items, current => seen.push(current));

      expect(seen).toEqual([...seen].sort((a, b) => a - b));
      expect(seen.at(-1)).toBe(250);
    });

    it("counts skipped and failed items as progress", async () => {
      mockGetAllFingerprints.mockResolvedValue(okResult(new Set(["fp:dup.mp3"])));
      const onProgress = vi.fn();

      await makePipeline(fakes).run(nativeItems("dup.mp3", "bad.txt"), onProgress);

      expect(onProgress).toHaveBeenLastCalledWith(2, 2);
    });
  });

  // ── Cancellation and pause ────────────────────────────────────

  describe("cancellation", () => {
    it("returns immediately when cancelled before the run starts", async () => {
      const control: ImportControl = { isCancelled: () => true };

      const result = await makePipeline(fakes).run(nativeItems("a.mp3"), undefined, control);

      expect(result.cancelled).toBe(true);
      expect(result.successful).toHaveLength(0);
      expect(fakes.computeFingerprint).not.toHaveBeenCalled();
    });

    it("stops before persisting when cancelled during parsing", async () => {
      let cancelled = false;
      fakes.parse.mockImplementation(async (name: string) => {
        cancelled = true;
        return makeMeta({ title: name });
      });

      const result = await makePipeline(fakes).run(
        nativeItems("a.mp3"),
        undefined,
        { isCancelled: () => cancelled },
      );

      expect(result.cancelled).toBe(true);
      expect(fakes.copyToStorage).not.toHaveBeenCalled();
      expect(mockUnitOfWorkRunScoped).not.toHaveBeenCalled();
    });

    it("does not report a cancelled item as a failure", async () => {
      let cancelled = false;
      fakes.parse.mockImplementation(async (name: string) => {
        cancelled = true;
        return makeMeta({ title: name });
      });

      const result = await makePipeline(fakes).run(
        nativeItems("a.mp3", "b.mp3"),
        undefined,
        { isCancelled: () => cancelled },
      );

      expect(result.failed).toHaveLength(0);
    });

    it("stops starting new batches once cancelled", async () => {
      const items = nativeItems(...Array.from({ length: PIPELINE_BATCH_SIZE * 3 }, (_, i) => `s${i}.mp3`));
      let calls = 0;
      const control: ImportControl = { isCancelled: () => ++calls > PIPELINE_BATCH_SIZE };

      const result = await makePipeline(fakes).run(items, undefined, control);

      expect(result.cancelled).toBe(true);
      expect(result.successful.length).toBeLessThan(items.length);
    });

    it("awaits waitIfPaused before continuing", async () => {
      let released = false;
      const control: ImportControl = {
        waitIfPaused: async () => { released = true; },
        isCancelled: () => false,
      };

      await makePipeline(fakes).run(nativeItems("a.mp3"), undefined, control);

      expect(released).toBe(true);
    });

    it("keeps the tracks it already persisted when cancelled mid-run", async () => {
      const items = nativeItems(...Array.from({ length: PIPELINE_BATCH_SIZE * 2 }, (_, i) => `s${i}.mp3`));
      let batches = 0;
      mockUnitOfWorkRunScoped.mockImplementation(async (_t: unknown, cb: () => Promise<void>) => {
        batches++;
        await cb();
        return okResult(undefined);
      });
      const control: ImportControl = { isCancelled: () => batches >= 2 };

      const result = await makePipeline(fakes).run(items, undefined, control);

      expect(result.cancelled).toBe(true);
      expect(result.successful.length).toBeGreaterThan(0);
    });
  });

  // ── Error isolation ───────────────────────────────────────────

  describe("error isolation", () => {
    it("reports a read failure without aborting the batch", async () => {
      fakes.readHeadBytes.mockImplementation(async (item: ImportItem) => {
        if (item.name === "bad.mp3") throw new Error("disk error");
        return new Uint8Array([1]);
      });

      const result = await makePipeline(fakes).run(nativeItems("good.mp3", "bad.mp3"));

      expect(result.successful).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.READ_FAILED);
      expect(result.failed[0].fileName).toBe("bad.mp3");
    });

    it("reports a parse failure without aborting the batch", async () => {
      fakes.parse.mockImplementation(async (name: string) => {
        if (name === "bad.mp3") throw new Error("bad tags");
        return makeMeta({ title: name });
      });

      const result = await makePipeline(fakes).run(nativeItems("good.mp3", "bad.mp3"));

      expect(result.successful).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.PARSE_FAILED);
    });

    it("reports a storage failure without aborting the batch", async () => {
      fakes.copyToStorage.mockImplementation(async (item: ImportItem) => {
        if (item.name === "bad.mp3") throw new Error("disk full");
      });

      const result = await makePipeline(fakes).run(nativeItems("good.mp3", "bad.mp3"));

      expect(result.successful).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.STORAGE_FAILED);
    });

    it("marks the whole transaction as failed when the DB write throws", async () => {
      mockUnitOfWorkRunScoped.mockResolvedValue({
        isOk: () => false,
        isErr: () => true,
        error: new Error("tx failed"),
      });

      const result = await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3"));

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(2);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.DATABASE_FAILED);
      expect(result.failed.map(f => f.fileName).sort()).toEqual(["a.mp3", "b.mp3"]);
    });

    it("survives a fingerprint provider that throws", async () => {
      fakes.computeFingerprint.mockRejectedValue(new Error("hash failed"));

      await expect(makePipeline(fakes).run(nativeItems("a.mp3"))).rejects.toThrow();
    });

    it("does not lose the file name on failure", async () => {
      fakes.parse.mockRejectedValue(new Error("nope"));

      const result = await makePipeline(fakes).run(nativeItems("Ödipus – Track 01.mp3"));

      expect(result.failed[0].fileName).toBe("Ödipus – Track 01.mp3");
    });
  });

  // ── Persistence side effects ──────────────────────────────────

  describe("persistence", () => {
    it("notifies the caller with the ids of persisted tracks", async () => {
      const onTracksImported = vi.fn();

      await makePipeline(fakes, onTracksImported).run(nativeItems("a.mp3", "b.mp3"));

      expect(onTracksImported).toHaveBeenCalledTimes(1);
      expect(onTracksImported.mock.calls[0][0]).toHaveLength(2);
    });

    it("does not notify when nothing was persisted", async () => {
      const onTracksImported = vi.fn();

      await makePipeline(fakes, onTracksImported).run(nativeItems("bad.txt"));

      expect(onTracksImported).not.toHaveBeenCalled();
    });

    it("creates each distinct artist once per transaction", async () => {
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, artists: ["Shared Artist"] }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3", "c.mp3"));

      expect(mockArtistCreateMany).toHaveBeenCalledTimes(1);
      expect(mockArtistCreateMany.mock.calls[0][0]).toHaveLength(1);
    });

    it("creates one album for tracks sharing artist and album", async () => {
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, artists: ["A"], album: "Same Album" }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3"));

      expect(mockAlbumCreateMany.mock.calls[0][0]).toHaveLength(1);
    });

    it("stores an embedded cover once per new album", async () => {
      const blob = new Blob([new Uint8Array(10)], { type: "image/png" });
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, artists: ["A"], album: "Cover Album", pictureBlob: blob }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3", "b.mp3"));

      expect(mockCoverCreateMany).toHaveBeenCalledTimes(1);
      expect(mockCoverCreateMany.mock.calls[0][0]).toHaveLength(1);
    });

    it("labels the stored cover with the type it actually has", async () => {
      // Small covers are stored untouched, so claiming image/webp would be a lie
      // — and the cover file name is derived from this field.
      const blob = new Blob([new Uint8Array(10)], { type: "image/jpeg" });
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, album: "Cover Album", pictureBlob: blob }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3"));

      expect(mockCoverCreateMany.mock.calls[0][0][0]).toMatchObject({
        mimeType: "image/jpeg",
        ownerType: "album",
      });
    });

    it("stores an embedded cover on the track itself when the tags carry no album", async () => {
      const blob = new Blob([new Uint8Array(10)], { type: "image/png" });
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, artists: ["A"], album: "", pictureBlob: blob }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3"));

      expect(mockAlbumCreateMany).not.toHaveBeenCalled();
      const trackId = mockTrackCreateMany.mock.calls[0][0][0].id;
      expect(mockCoverCreateMany.mock.calls[0][0][0]).toMatchObject({
        ownerType: "track",
        ownerId: trackId,
      });
    });

    it("stores an embedded cover on the track when the album cannot be resolved without an artist", async () => {
      const blob = new Blob([new Uint8Array(10)], { type: "image/png" });
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, artists: [], album: "Some Album", pictureBlob: blob }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3"));

      expect(mockCoverCreateMany.mock.calls[0][0][0]).toMatchObject({ ownerType: "track" });
    });

    it("persists the fingerprint alongside the track", async () => {
      await makePipeline(fakes).run(nativeItems("a.mp3"));

      expect(mockTrackCreateMany.mock.calls[0][0][0]).toMatchObject({
        fingerprint: "fp:a.mp3",
        storagePath: expect.stringMatching(/^tracks\/[\w-]+\.mp3$/),
      });
    });

    it("does not create an album for tracks tagged Unknown Album", async () => {
      fakes.parse.mockImplementation(async (name: string) =>
        makeMeta({ title: name, album: "Unknown Album" }),
      );

      await makePipeline(fakes).run(nativeItems("a.mp3"));

      expect(mockAlbumCreateMany).not.toHaveBeenCalled();
    });
  });

  // ── Item construction ─────────────────────────────────────────

  describe("item construction", () => {
    it("extracts the file name from both path separator styles", () => {
      const items = itemsFromPaths(["C:\\Music\\a.mp3", "/home/me/b.flac"]);

      expect(items.map(i => i.name)).toEqual(["a.mp3", "b.flac"]);
      expect(items.map(i => i.ext)).toEqual(["mp3", "flac"]);
    });

    it("carries the File size and type through for web items", () => {
      const [item] = itemsFromFiles([new File(["abc"], "s.mp3", { type: "audio/mpeg" })]);

      expect(item).toMatchObject({ type: "web", name: "s.mp3", ext: "mp3", fileSize: 3 });
    });

    it("reports no extension for a name without a dot", () => {
      expect(extensionOf("song")).toBe("");
      expect(extensionOf("a.mp3")).toBe("mp3");
      expect(extensionOf("A.MP3")).toBe("mp3");
    });

    it("does not mistake a dot in a folder name for an extension", () => {
      const [item] = itemsFromPaths(["/music/The B-52's Vol.2/song"]);

      expect(item.ext).toBe("");
      expect(item.name).toBe("song");
    });

    it("falls back to the MIME type when a dropped file has no extension", () => {
      const [item] = itemsFromFiles([new File([""], "song", { type: "audio/flac" })]);

      expect(item.ext).toBe("flac");
    });

    it("leaves the extension empty when neither name nor MIME type gives one", () => {
      const [item] = itemsFromFiles([new File([""], "song", { type: "application/zip" })]);

      expect(item.ext).toBe("");
    });
  });
});
