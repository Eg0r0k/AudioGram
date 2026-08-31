import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateLibraryData } from "@/queries/library.queries";
import { musicLibraryEngine } from "@/services/importer.service";
import { useImport } from "../useImport";
import type { ImportBatchResult, ImportControl } from "@/services/importer.service";

vi.mock("@tanstack/vue-query", () => ({
  useQueryClient: () => ({ queryClient: true }),
}));

vi.mock("@/queries/library.queries", () => ({
  invalidateLibraryData: vi.fn(),
}));

vi.mock("@/lib/environment/userAgent", () => ({
  IS_TAURI: false,
}));

vi.mock("@/services/importer.service", () => ({
  musicLibraryEngine: {
    importFiles: vi.fn(),
    importFromPaths: vi.fn(),
  },
}));

vi.mock("@/modules/search/service/searchIndex", () => ({
  indexImportedTracks: vi.fn().mockResolvedValue(undefined),
}));

function createFile(name: string) {
  return new File(["audio"], name, { type: "audio/mpeg" });
}

function createResult(overrides: Partial<ImportBatchResult> = {}): ImportBatchResult {
  return {
    successful: [],
    failed: [],
    skipped: 0,
    total: 0,
    ...overrides,
  };
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await nextTick();
}

describe("useImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useImport().reset();
  });

  afterEach(() => {
    useImport().reset();
  });

  it("tracks import progress and invalidates library data after successful imports", async () => {
    const result = createResult({
      successful: [{
        trackId: "track-1" as never,
        fileName: "first.mp3",
        title: "First",
        artist: "Artist",
        album: "Album",
      }],
      total: 2,
    });

    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(async (_files, onProgress) => {
      onProgress?.(1, 2);
      onProgress?.(2, 2);
      return result;
    });

    const importer = useImport();

    await importer.importFiles([
      createFile("first.mp3"),
      createFile("second.mp3"),
    ]);

    expect(importer.isOpen.value).toBe(true);
    expect(importer.isRunning.value).toBe(false);
    expect(importer.current.value).toBe(2);
    expect(importer.total.value).toBe(2);
    expect(importer.progress.value).toBe(100);
    expect(importer.successCount.value).toBe(1);
    expect(invalidateLibraryData).toHaveBeenCalledOnce();
  });

  it("pauses the active import until resumeImport is called", async () => {
    const beforePauseGate = createDeferred();
    const waitStarted = createDeferred();
    const importFinished = vi.fn();

    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(async (_files, onProgress, control?: ImportControl) => {
      onProgress?.(0, 1);
      await beforePauseGate.promise;
      waitStarted.resolve();
      await control?.waitIfPaused?.();
      onProgress?.(1, 1);
      importFinished();
      return createResult({ total: 1 });
    });

    const importer = useImport();
    const importPromise = importer.importFiles([createFile("track.mp3")]);

    importer.pauseImport();
    beforePauseGate.resolve();
    await waitStarted.promise;
    await flushPromises();

    expect(importer.isPaused.value).toBe(true);
    expect(importer.isRunning.value).toBe(true);
    expect(importer.current.value).toBe(0);
    expect(importFinished).not.toHaveBeenCalled();

    importer.resumeImport();
    await importPromise;

    expect(importer.isPaused.value).toBe(false);
    expect(importer.isRunning.value).toBe(false);
    expect(importer.current.value).toBe(1);
    expect(importFinished).toHaveBeenCalledOnce();
  });

  it("cancels a paused import without processing more progress", async () => {
    const beforePauseGate = createDeferred();
    const waitStarted = createDeferred();
    const processedAfterPause = vi.fn();

    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(async (_files, onProgress, control?: ImportControl) => {
      onProgress?.(1, 3);
      await beforePauseGate.promise;
      waitStarted.resolve();
      await control?.waitIfPaused?.();

      if (control?.isCancelled?.()) {
        return createResult({ total: 3 });
      }

      processedAfterPause();
      onProgress?.(2, 3);
      return createResult({ total: 3 });
    });

    const importer = useImport();
    const importPromise = importer.importFiles([
      createFile("one.mp3"),
      createFile("two.mp3"),
      createFile("three.mp3"),
    ]);

    importer.pauseImport();
    beforePauseGate.resolve();
    await waitStarted.promise;
    await flushPromises();

    await importer.cancelImport();
    await importPromise;

    expect(processedAfterPause).not.toHaveBeenCalled();
    expect(importer.isRunning.value).toBe(false);
    expect(importer.isPaused.value).toBe(false);
    expect(importer.current.value).toBe(1);
  });

  it("returns from cancellation immediately when the engine has not reached a pause point yet", async () => {
    const engineGate = createDeferred();

    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(async (_files, onProgress) => {
      onProgress?.(0, 1);
      await engineGate.promise;
      onProgress?.(1, 1);
      return createResult({ total: 1 });
    });

    const importer = useImport();
    const importPromise = importer.importFiles([createFile("early.mp3")]);
    await flushPromises();

    await importer.cancelImport();

    expect(importer.isRunning.value).toBe(false);
    expect(importer.isCancelling.value).toBe(false);

    engineGate.resolve();
    await importPromise;

    expect(importer.current.value).toBe(0);
    expect(importer.progress.value).toBe(0);
  });
});
