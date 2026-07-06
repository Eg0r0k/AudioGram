import { describe, it, expect, vi, beforeEach } from "vitest";
import { MusicLibraryEngine } from "../importer.service";
import type { ScannedFile } from "@/modules/watched-folders/types";
import { ImportErrorCode } from "../types";

// ── Hoisted shared mocks + helper (available in vi.mock factories) ──

const {
  mockWorkerPoolParse,
  mockReadBytes,
  mockImportFile,
  mockSaveFile,
  mockWarmup,
  mockOpen,
  mockHasNativeSupport,
  mockGetAllFingerprints,
  mockUnitOfWorkRun,
  MockWorkerPool,
} = vi.hoisted(() => ({
  mockWorkerPoolParse: vi.fn(),
  mockReadBytes: vi.fn(),
  mockImportFile: vi.fn(),
  mockSaveFile: vi.fn(),
  mockWarmup: vi.fn(),
  mockOpen: vi.fn(),
  mockHasNativeSupport: vi.fn(() => true),
  mockGetAllFingerprints: vi.fn(),
  mockUnitOfWorkRun: vi.fn(),
  MockWorkerPool: vi.fn().mockImplementation(function() {
    return { parse: mockWorkerPoolParse, dispose: vi.fn() };
  }),
}));

// Simple Result shim for mock return values
function okResult<T>(val: T) {
  return { isOk: () => true, isErr: () => false, value: val, match: (ok: (v: T) => any, _: any) => ok(val) };
}

// ── Module mocks ────────────────────────────────────────────────

vi.mock("../worker-pool", () => ({
  WorkerPool: MockWorkerPool,
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: mockOpen,
}));

vi.mock("@/db/storage", () => ({
  storageService: {
    warmup: mockWarmup,
    readBytes: mockReadBytes,
    saveFile: mockSaveFile,
    importFile: mockImportFile,
    listFiles: vi.fn(),
    deleteFile: vi.fn(),
    getFileSize: vi.fn(),
    getFile: vi.fn(),
    getAudioUrl: vi.fn(),
  },
}));

vi.mock("@/db/storage/IFileStorage", () => ({
  hasNativeSupport: mockHasNativeSupport,
}));

vi.mock("@/db/repositories", () => ({
  trackRepository: {
    getAllFingerprints: mockGetAllFingerprints,
    findByStoragePath: vi.fn().mockResolvedValue(okResult(undefined)),
    findByStoragePathPrefix: vi.fn().mockResolvedValue(okResult([])),
    existsByFingerprint: vi.fn().mockResolvedValue(okResult(false)),
    createMany: vi.fn().mockResolvedValue(okResult([])),
    findByIds: vi.fn().mockResolvedValue(okResult([])),
    findAll: vi.fn().mockResolvedValue(okResult([])),
    delete: vi.fn().mockResolvedValue(okResult(undefined)),
    deleteMany: vi.fn().mockResolvedValue(okResult(undefined)),
  },
  artistRepository: {
    findByIds: vi.fn().mockResolvedValue(okResult([])),
    createMany: vi.fn().mockResolvedValue(okResult([])),
  },
  albumRepository: {
    findByIds: vi.fn().mockResolvedValue(okResult([])),
    createMany: vi.fn().mockResolvedValue(okResult([])),
  },
  coverRepository: {
    createMany: vi.fn().mockResolvedValue(okResult([])),
  },
}));

vi.mock("@/db/unit-of-work", () => ({
  unitOfWork: {
    run: mockUnitOfWorkRun,
  },
}));

// EntityResolver accesses @/db directly; mock to prevent IndexedDB init
vi.mock("@/db", () => {
  const chain = { equals: vi.fn().mockReturnThis(), anyOf: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]) };
  return {
    db: {
      artists: { where: vi.fn().mockReturnValue(chain) },
      albums: { where: vi.fn().mockReturnValue(chain) },
      tracks: { where: vi.fn().mockReturnValue(chain) },
    },
  };
});

vi.mock("@/modules/watched-folders/services/folder-scanner", () => ({
  scanFolder: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/modules/watched-folders/services/file-fingerprint", () => ({
  computeFileFingerprint: vi.fn().mockResolvedValue("mock-fp-abc123"),
  computeFileFingerprintFromBlob: vi.fn().mockResolvedValue("mock-fp-blob"),
}));

// ── Helpers ─────────────────────────────────────────────────────

function makeBaseMetadata(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Track",
    artists: ["Test Artist"],
    album: "Test Album",
    year: 2024,
    duration: 200,
    trackNo: 1,
    diskNo: 1,
    format: { codec: "MP3", bitrate: 320000, sampleRate: 44100, lossless: false, channels: 2 },
    pictureBlob: undefined,
    integratedLufs: undefined,
    truePeakDbtp: undefined,
    replayGainDb: undefined,
    replayPeak: undefined,
    ...overrides,
  };
}

function makeFile(name = "song.mp3"): File {
  return new File(["fake audio data"], name, { type: "audio/mpeg" });
}

function makeScannedFile(overrides: Partial<ScannedFile> = {}): ScannedFile {
  return {
    absolutePath: "/music/song.mp3",
    name: "song.mp3",
    ext: "mp3",
    size: 5_000_000,
    modifiedAt: Date.now(),
    ...overrides,
  };
}

// ── Test suite ──────────────────────────────────────────────────

describe("MusicLibraryEngine", () => {
  let engine: MusicLibraryEngine;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWorkerPoolParse.mockResolvedValue(makeBaseMetadata());
    mockReadBytes.mockResolvedValue(okResult(new Uint8Array([0, 1, 2])));
    mockImportFile.mockResolvedValue(okResult("tracks/new-id.mp3"));
    mockSaveFile.mockResolvedValue(okResult("tracks/new-id.mp3"));
    mockWarmup.mockResolvedValue(undefined);
    mockOpen.mockResolvedValue(null);
    mockGetAllFingerprints.mockResolvedValue(okResult(new Set<string>()));
    mockUnitOfWorkRun.mockImplementation((cb: () => Promise<void>) => {
      return Promise.resolve({ isOk: () => true, isErr: () => false, value: cb() });
    });
    mockHasNativeSupport.mockReturnValue(true);

    engine = new MusicLibraryEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  // ── useImport: importFromPaths ────────────────────────────────

  describe("pickFiles", () => {
    it("uses caller-provided dialog title", async () => {
      mockOpen.mockResolvedValue(["/music/song.mp3"]);

      const result = await engine.pickFiles({ title: "Choose audio files" });

      expect(mockOpen).toHaveBeenCalledWith({
        multiple: true,
        title: "Choose audio files",
        filters: [{ name: "Audio", extensions: ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma", "alac"] }],
      });
      expect(result).toEqual(["/music/song.mp3"]);
    });

    it("allows caller-provided filter options", async () => {
      await engine.pickFiles({ title: "Import", filterName: "Lossless", extensions: ["flac", "alac"] });

      expect(mockOpen).toHaveBeenCalledWith({
        multiple: true,
        title: "Import",
        filters: [{ name: "Lossless", extensions: ["flac", "alac"] }],
      });
    });
  });

  describe("importFromPaths (Tauri native, user-initiated)", () => {
    it("calls workerPool.parse with extractCover: true", async () => {
      await engine.importFromPaths(["/music/song.mp3"]);

      expect(mockWorkerPoolParse).toHaveBeenCalledWith(
        "song.mp3",
        expect.any(Uint8Array),
        { extractCover: true },
      );
    });

    it("returns successful items on success", async () => {
      const result = await engine.importFromPaths(["/music/song.mp3"]);

      expect(mockWorkerPoolParse).toHaveBeenCalled();
      expect(mockImportFile).toHaveBeenCalled();
      expect(mockUnitOfWorkRun).toHaveBeenCalled();
      expect(result.failed).toHaveLength(0);
      expect(result.successful).toHaveLength(1);
      expect(result.successful[0].fileName).toBe("song.mp3");
    });

    it("returns empty result when native support is missing", async () => {
      mockHasNativeSupport.mockReturnValue(false);

      const result = await engine.importFromPaths(["/music/song.mp3"]);

      expect(result.successful).toHaveLength(0);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.NATIVE_IMPORT_UNAVAILABLE);
    });
  });

  // ── useImport: importFiles ────────────────────────────────────

  describe("importFiles (web File, user-initiated)", () => {
    it("calls workerPool.parse with extractCover: true", async () => {
      await engine.importFiles([makeFile()]);

      expect(mockWorkerPoolParse).toHaveBeenCalledWith(
        "song.mp3",
        expect.any(Uint8Array),
        { extractCover: true },
      );
    });

    it("reads the full file from the File object", async () => {
      const largeFile = makeFile("large.flac");
      Object.defineProperty(largeFile, "size", { value: 100_000_000 });
      const arrayBufferSpy = vi.spyOn(largeFile, "arrayBuffer");

      await engine.importFiles([largeFile]);

      expect(arrayBufferSpy).toHaveBeenCalledOnce();
    });
  });

  // ── useWatchedFolders: importSingleExternalFile ───────────────

  describe("importSingleExternalFile (watched folders)", () => {
    it("calls workerPool.parse with extractCover: true", async () => {
      await engine.importSingleExternalFile(makeScannedFile());

      expect(mockWorkerPoolParse).toHaveBeenCalledWith(
        "song.mp3",
        expect.any(Uint8Array),
        { extractCover: true },
      );
    });

    it("returns false when native support is missing", async () => {
      mockHasNativeSupport.mockReturnValue(false);

      const result = await engine.importSingleExternalFile(makeScannedFile());

      expect(result).toBe(false);
      expect(mockWorkerPoolParse).not.toHaveBeenCalled();
    });

    it("returns false when read fails", async () => {
      mockReadBytes.mockResolvedValue({ isOk: () => false, isErr: () => true, error: new Error("read failed") });

      const result = await engine.importSingleExternalFile(makeScannedFile());

      expect(result).toBe(false);
    });

    it("returns true on successful import", async () => {
      mockUnitOfWorkRun.mockImplementation((cb: () => Promise<void>) => {
        const result = cb();
        return Promise.resolve({ isOk: () => true, isErr: () => false, value: result });
      });

      const result = await engine.importSingleExternalFile(makeScannedFile());

      expect(mockWorkerPoolParse).toHaveBeenCalled();
      expect(mockUnitOfWorkRun).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // ── useWatchedFolders: syncFolder ─────────────────────────────

  describe("syncFolder (watched folders full scan)", () => {
    it("reads up to file size when under LARGE_FILE_THRESHOLD", async () => {
      const scanner = await import("@/modules/watched-folders/services/folder-scanner");
      vi.mocked(scanner.scanFolder).mockResolvedValue([makeScannedFile({ size: 1_000_000 })]);

      await engine.syncFolder({ id: "f1", path: "/music", name: "Music", status: "idle" });

      expect(mockReadBytes).toHaveBeenCalledWith(expect.any(String), 1_000_000);
    });

    it("reads up to MAX_METADATA_READ for large files", async () => {
      const scanner = await import("@/modules/watched-folders/services/folder-scanner");
      vi.mocked(scanner.scanFolder).mockResolvedValue([makeScannedFile({ size: 100_000_000 })]);

      await engine.syncFolder({ id: "f1", path: "/music", name: "Music", status: "idle" });

      expect(mockReadBytes).toHaveBeenCalledWith(expect.any(String), 12 * 1024 * 1024);
    });

    it("returns empty SyncResult when native support is missing", async () => {
      mockHasNativeSupport.mockReturnValue(false);

      const result = await engine.syncFolder({
        id: "f1", path: "/music", name: "Music", status: "idle",
      });

      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
    });
  });

  // ── Fingerprint dedup ─────────────────────────────────────────

  describe("fingerprint deduplication", () => {
    it("skips files with already-known fingerprint", async () => {
      mockGetAllFingerprints.mockResolvedValue(okResult(new Set(["1234:abcdef"])));

      const computeFp = await import("@/modules/watched-folders/services/file-fingerprint");
      vi.mocked(computeFp.computeFileFingerprint).mockResolvedValue("1234:abcdef");

      await engine.importFromPaths(["/music/duplicate.mp3"]);

      expect(mockWorkerPoolParse).not.toHaveBeenCalled();
    });

    it("deduplicates within the same batch", async () => {
      const computeFp = await import("@/modules/watched-folders/services/file-fingerprint");
      vi.mocked(computeFp.computeFileFingerprintFromBlob).mockResolvedValue("same-fp");

      const file1 = makeFile("same.mp3");
      const file2 = makeFile("same.mp3");
      Object.defineProperty(file1, "size", { value: 1000 });
      Object.defineProperty(file2, "size", { value: 1000 });

      await engine.importFiles([file1, file2]);

      expect(mockWorkerPoolParse).toHaveBeenCalledTimes(1);
    });

    it("deduplicates by path when same native file appears twice in one batch", async () => {
      await engine.importFromPaths(["/music/same.mp3", "/music/same.mp3"]);

      expect(mockWorkerPoolParse).toHaveBeenCalledTimes(1);
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe("error handling", () => {
    it("does not throw when worker parse fails", async () => {
      mockWorkerPoolParse.mockRejectedValue(new Error("parse failed"));

      const result = await engine.importFromPaths(["/music/bad.mp3"]);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.PARSE_FAILED);
      // successful items are still collected normally when error is isolated per item
    });

    it("does not throw when read fails via native storage", async () => {
      mockReadBytes.mockResolvedValue({ isOk: () => false, isErr: () => true, error: new Error("disk error") });

      const result = await engine.importFromPaths(["/music/bad.mp3"]);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].error.code).toBe(ImportErrorCode.READ_FAILED);
    });

    it("marks a run as cancelled when control is cancelled before processing", async () => {
      const result = await engine.importFiles([makeFile()], undefined, { isCancelled: () => true });

      expect(result.cancelled).toBe(true);
      expect(result.failed).toHaveLength(0);
      expect(mockWorkerPoolParse).not.toHaveBeenCalled();
    });

    it("does not report cancellation as a read failure", async () => {
      let isCancelled = false;
      mockWorkerPoolParse.mockImplementation(async () => {
        isCancelled = true;
        return makeBaseMetadata();
      });

      const result = await engine.importFiles([makeFile()], undefined, { isCancelled: () => isCancelled });

      expect(result.cancelled).toBe(true);
      expect(result.failed).toHaveLength(0);
      expect(mockSaveFile).not.toHaveBeenCalled();
    });
  });
});
