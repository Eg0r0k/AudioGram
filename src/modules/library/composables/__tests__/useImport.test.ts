import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import { invalidateLibraryData } from "@/queries/library.queries";
import { musicLibraryEngine } from "@/services/importer.service";
import { IMPORT_AUTO_DISMISS_MS, useImport } from "../useImport";
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

vi.mock("vue-sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

const rightPanelMocks = vi.hoisted(() => ({ openImport: vi.fn(), isOpen: false, view: "none" }));
vi.mock("@/modules/right-panel/store/right-panel.store", () => ({
  useRightPanelStore: () => rightPanelMocks,
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

describe("useImport completion feedback", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    vi.clearAllMocks();
    useImport().reset();
  });

  const success = (fileName: string) => ({
    trackId: fileName as never,
    fileName,
    title: fileName,
    artist: "Artist",
    album: "Album",
  });

  it("exposes live counts derived from the file list", async () => {
    vi.mocked(musicLibraryEngine.importFiles).mockResolvedValue(createResult({
      successful: [success("a.mp3")],
      failed: [{ fileName: "b.mp3", error: { code: "PARSE_FAILED", message: "bad" } as never }],
      skipped: 1,
      total: 3,
    }));

    const importer = useImport();
    await importer.importFiles([createFile("a.mp3"), createFile("b.mp3"), createFile("c.mp3")]);

    expect(importer.liveCounts.value).toEqual({ ok: 1, error: 1, skipped: 1 });
  });

  it("raises a success toast when every file imported", async () => {
    vi.mocked(musicLibraryEngine.importFiles).mockResolvedValue(createResult({
      successful: [success("a.mp3"), success("b.mp3")],
      total: 2,
    }));

    await useImport().importFiles([createFile("a.mp3"), createFile("b.mp3")]);

    expect(toast.success).toHaveBeenCalledWith("Imported 2 tracks");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("raises a warning toast whose action opens the import panel when files failed", async () => {
    vi.mocked(musicLibraryEngine.importFiles).mockResolvedValue(createResult({
      successful: [success("a.mp3")],
      failed: [{ fileName: "b.mp3", error: { code: "PARSE_FAILED", message: "bad" } as never }],
      total: 2,
    }));

    await useImport().importFiles([createFile("a.mp3"), createFile("b.mp3")]);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledOnce();
    const [message, options] = vi.mocked(toast.warning).mock.calls[0] as [string, { action: { label: string; onClick: () => void } }];
    expect(message).toBe("Imported 1, 1 with issues");
    expect(options.action.label).toBe("Details");
    options.action.onClick();
    expect(rightPanelMocks.openImport).toHaveBeenCalledOnce();
  });

  it("raises no toast for a cancelled import", async () => {
    const gate = createDeferred();
    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(async (_files, onProgress, control?: ImportControl) => {
      onProgress?.(0, 1);
      await gate.promise;
      control?.isCancelled?.();
      return createResult({ total: 1 });
    });

    const importer = useImport();
    const run = importer.importFiles([createFile("a.mp3")]);
    await flushPromises();
    importer.cancelImport();
    gate.resolve();
    await run;

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe("useImport auto dismiss", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    rightPanelMocks.isOpen = false;
    rightPanelMocks.view = "none";
    useImport().reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const finishedImport = async () => {
    vi.mocked(musicLibraryEngine.importFiles).mockResolvedValue(createResult({
      successful: [{ trackId: "a" as never, fileName: "a.mp3", title: "A", artist: "Artist", album: "Album" }],
      total: 1,
    }));
    const importer = useImport();
    await importer.importFiles([createFile("a.mp3")]);
    return importer;
  };

  it("clears the finished session after the dismiss delay", async () => {
    const importer = await finishedImport();
    expect(importer.isOpen.value).toBe(true);

    vi.advanceTimersByTime(IMPORT_AUTO_DISMISS_MS - 1);
    expect(importer.isOpen.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(importer.isOpen.value).toBe(false);
    expect(importer.files.value).toEqual([]);
  });

  it("keeps the session while the import panel is showing it", async () => {
    rightPanelMocks.isOpen = true;
    rightPanelMocks.view = "import";
    const importer = await finishedImport();

    vi.advanceTimersByTime(IMPORT_AUTO_DISMISS_MS);
    expect(importer.isOpen.value).toBe(true);
  });

  it("drops the pending dismissal when a new import starts", async () => {
    const importer = await finishedImport();
    const gate = createDeferred<ImportBatchResult>();
    vi.mocked(musicLibraryEngine.importFiles).mockImplementation(() => gate.promise);

    const second = importer.importFiles([createFile("b.mp3")]);
    vi.advanceTimersByTime(IMPORT_AUTO_DISMISS_MS);
    expect(importer.isOpen.value).toBe(true);
    expect(importer.isRunning.value).toBe(true);

    gate.resolve(createResult({ total: 1 }));
    await second;
  });
});
