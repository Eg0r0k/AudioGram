import { ref, computed } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { musicLibraryEngine } from "@/services/importer.service";
import { invalidateLibraryData } from "@/queries/library.queries";
import { filterFilesByExtension } from "@/lib/files/filterFiles";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { requestFiles } from "@/lib/files/requestFiles";
import { ImportBatchResult, ImportErrorCode } from "@/services/types";

export type ImportFileStatus = "pending" | "ok" | "error" | "skipped";

export interface ImportFileItem {
  name: string;
  status: ImportFileStatus;
  error?: string;
  errorCode?: ImportErrorCode;
  title?: string;
  artist?: string;
}

export interface ImportState {
  isOpen: boolean;
  isRunning: boolean;
  progress: number;
  total: number;
  current: number;
  files: ImportFileItem[];
  visibleFileCount: number;
  result: ImportBatchResult | null;
  isPaused: boolean;
  isCancelling: boolean;
}

const ACCEPTED_EXTENSIONS = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus"];
const MAX_VISIBLE_IMPORT_FILES = 500;

const state = ref<ImportState>({
  isOpen: false,
  isRunning: false,
  progress: 0,
  total: 0,
  current: 0,
  files: [],
  visibleFileCount: 0,
  result: null,
  isPaused: false,
  isCancelling: false,
});

let activeImportPromise: Promise<void> | null = null;
let isCancelRequested = false;
let activeImportId = 0;
let pausePromise: Promise<void> | null = null;
let pauseResolver: (() => void) | null = null;

export function useImport() {
  const queryClient = useQueryClient();

  const isOpen = computed(() => state.value.isOpen);
  const isRunning = computed(() => state.value.isRunning);
  const progress = computed(() => state.value.progress);
  const files = computed(() => state.value.files);
  const result = computed(() => state.value.result);
  const isPaused = computed(() => state.value.isPaused);
  const isCancelling = computed(() => state.value.isCancelling);
  const total = computed(() => state.value.total);
  const current = computed(() => state.value.current);
  const visibleFileCount = computed(() => state.value.visibleFileCount);

  const successCount = computed(() => state.value.result?.successful.length ?? 0);
  const errorCount = computed(() => state.value.result?.failed.length ?? 0);
  const skippedCount = computed(() => state.value.result?.skipped ?? 0);

  function openSheet() {
    state.value.isOpen = true;
  }

  function closeSheet() {
    if (state.value.isRunning) return;
    state.value.isOpen = false;
  }

  function reset() {
    state.value = {
      isOpen: false,
      isRunning: false,
      progress: 0,
      total: 0,
      current: 0,
      files: [],
      visibleFileCount: 0,
      result: null,
      isPaused: false,
      isCancelling: false,
    };
    isCancelRequested = false;
    activeImportId++;
    pauseResolver?.();
    pauseResolver = null;
    pausePromise = null;
  }

  async function importFiles(files: File[]) {
    const filtered = filterFilesByExtension(files, ACCEPTED_EXTENSIONS);
    if (filtered.length === 0) return;

    const firstFile = filtered[0] as File & { path?: string };
    if (IS_TAURI && firstFile.path) {
      const paths = filtered.map(f => (f as File & { path: string }).path);
      return importFromPaths(paths);
    }

    const importId = _startImport(filtered.map(f => f.name));

    activeImportPromise = (async () => {
      const result = await musicLibraryEngine.importFiles(
        filtered,
        (current, total) => _onProgress(importId, current, total),
        { waitIfPaused, isCancelled: () => isCancelRequested },
      );

      await _finishImport(importId, result);
    })().finally(() => {
      if (activeImportId === importId) {
        activeImportPromise = null;
      }
    });

    await activeImportPromise;
  }

  async function importFromPaths(paths: string[]) {
    if (paths.length === 0) return;

    const importId = _startImport(paths.map(p => p.split(/[\\/]/).pop() ?? p));

    activeImportPromise = (async () => {
      const result = await musicLibraryEngine.importFromPaths(
        paths,
        (current, total) => _onProgress(importId, current, total),
        { waitIfPaused, isCancelled: () => isCancelRequested },
      );

      await _finishImport(importId, result);
    })().finally(() => {
      if (activeImportId === importId) {
        activeImportPromise = null;
      }
    });

    await activeImportPromise;
  }

  function _startImport(fileNames: string[]) {
    const importId = activeImportId + 1;
    const visibleFiles = fileNames.slice(0, MAX_VISIBLE_IMPORT_FILES);

    activeImportId = importId;
    state.value = {
      isOpen: true,
      isRunning: true,
      progress: 0,
      total: fileNames.length,
      current: 0,
      files: visibleFiles.map(name => ({ name, status: "pending" })),
      visibleFileCount: visibleFiles.length,
      result: null,
      isPaused: false,
      isCancelling: false,
    };
    isCancelRequested = false;
    pauseResolver = null;

    return importId;
  }

  async function waitIfPaused() {
    if (pausePromise) {
      await pausePromise;
    }
  }
  function pauseImport() {
    if (!state.value.isRunning || state.value.isCancelling) return;
    state.value.isPaused = true;
    pausePromise = new Promise<void>((resolve) => {
      pauseResolver = resolve;
    });
  }

  function resumeImport() {
    state.value.isPaused = false;
    pauseResolver?.();
    pauseResolver = null;
    pausePromise = null;
  }

  async function cancelImport() {
    if (!state.value.isRunning) return;

    isCancelRequested = true;
    activeImportId++;
    state.value.isCancelling = true;
    resumeImport();
    state.value.isRunning = false;
    state.value.isPaused = false;
    state.value.isCancelling = false;
  }

  function _onProgress(importId: number, current: number, total: number) {
    if (importId !== activeImportId || isCancelRequested) return;

    const previousCurrent = state.value.current;

    state.value.current = current;
    state.value.total = total;
    state.value.progress = total > 0 ? Math.round((current / total) * 100) : 0;

    for (let i = previousCurrent; i < current && i < state.value.files.length; i++) {
      if (state.value.files[i].status === "pending") {
        state.value.files[i].status = "ok";
      }
    }
  }

  async function _finishImport(importId: number, result: ImportBatchResult) {
    if (importId !== activeImportId || isCancelRequested) return;

    const successMap = new Map(result.successful.map(s => [s.fileName, s]));
    const errorMap = new Map(result.failed.map(f => [f.fileName, f.error]));

    state.value.files = state.value.files.map((f) => {
      const success = successMap.get(f.name);
      if (success) {
        return { ...f, status: "ok", title: success.title, artist: success.artist };
      }
      const error = errorMap.get(f.name);
      if (error) {
        return { ...f, status: "error", error: error.message, errorCode: error.code };
      }
      return { ...f, status: "skipped" };
    });

    state.value.result = result;
    state.value.progress = 100;
    state.value.isPaused = false;
    state.value.isCancelling = false;

    if (result.successful.length > 0) {
      await invalidateLibraryData(queryClient);
    }

    state.value.isRunning = false;
  }

  /**
   * Opens a file picker and imports the selection. In Tauri we MUST use the
   * native dialog (→ absolute paths → {@link importFromPaths}); the HTML
   * `<input type=file>` picker misbehaves in WebView2 and forces the slower
   * web-`File` branch. The web build keeps the HTML input.
   */
  async function pickAndImport(options?: { title?: string }) {
    if (IS_TAURI && musicLibraryEngine.isNativeImportAvailable) {
      const paths = await musicLibraryEngine.pickFiles({
        title: options?.title ?? "Import tracks",
      });
      if (paths && paths.length > 0) {
        await importFromPaths(paths);
      }
      return;
    }

    const files = await requestFiles({
      accept: ACCEPTED_EXTENSIONS.join(","),
      multiple: true,
    }).catch(() => [] as File[]);
    if (files.length > 0) {
      await importFiles(files);
    }
  }

  return {
    isOpen,
    isRunning,
    progress,
    isPaused,
    isCancelling,
    files,
    result,
    total,
    current,
    visibleFileCount,
    successCount,
    errorCount,
    skippedCount,
    openSheet,
    closeSheet,
    reset,
    pauseImport,
    resumeImport,
    cancelImport,
    importFiles,
    importFromPaths,
    pickAndImport,
  };
}
