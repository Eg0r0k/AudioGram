import { IS_TAURI } from "@/helpers/environment/userAgent";
import { filterFilesByExtension } from "@/helpers/files/filterFiles";
import { getFilesFromEvent } from "@/helpers/files/getFilesFromEvent";
import { ref, onMounted, onUnmounted } from "vue";

export interface UseFileDropOptions {
  acceptedExtensions?: string[];
  onDrop?: (files: File[]) => void;
}

export function useFileDrop(options?: UseFileDropOptions) {
  const isDragging = ref(false);
  const droppedFiles = ref<File[]>([]);
  const isProcessing = ref(false);

  let cleanup: (() => void) | null = null;

  const setupTauri = async () => {
    const { getCurrentWebviewWindow } = await import(
      "@tauri-apps/api/webviewWindow",
    );
    const { readDir, stat } = await import("@tauri-apps/plugin-fs");

    const appWindow = getCurrentWebviewWindow();

    const hasValidExtension = (path: string): boolean => {
      if (!options?.acceptedExtensions?.length) return true;
      return options.acceptedExtensions.some(ext =>
        path.toLowerCase().endsWith(ext.toLowerCase()),
      );
    };

    const collectFiles = async (dirPath: string): Promise<string[]> => {
      const files: string[] = [];
      try {
        const entries = await readDir(dirPath);
        for (const entry of entries) {
          const fullPath = `${dirPath}/${entry.name}`;
          if (entry.isDirectory) {
            files.push(...(await collectFiles(fullPath)));
          }
          else if (entry.isFile && hasValidExtension(entry.name)) {
            files.push(fullPath);
          }
        }
      }
      catch (e) {
        console.error(e);
      }
      return files;
    };

    const processPaths = async (paths: string[]): Promise<string[]> => {
      const result: string[] = [];
      for (const path of paths) {
        try {
          const info = await stat(path);
          if (info.isDirectory) {
            result.push(...(await collectFiles(path)));
          }
          else if (info.isFile && hasValidExtension(path)) {
            result.push(path);
          }
        }
        catch (e) {
          console.error(e);
        }
      }
      return result;
    };

    const unlisten = await appWindow.onDragDropEvent(async (event) => {
      const data = event.payload;

      if (data.type === "over" || data.type === "enter") {
        isDragging.value = true;
      }
      else if (data.type === "leave") {
        isDragging.value = false;
      }
      else if (data.type === "drop") {
        isDragging.value = false;
        isProcessing.value = true;

        try {
          const paths = await processPaths(data.paths);
          const files = paths.map((path) => {
            const name = path.split(/[/\\]/).pop() || path;
            return Object.assign(new Blob(), {
              name,
              path,
              relativePath: path,
            }) as unknown as File;
          });

          droppedFiles.value = files;
          options?.onDrop?.(files);
        }
        finally {
          isProcessing.value = false;
        }
      }
    });

    cleanup = unlisten;
  };

  // ============ BROWSER ============
  const setupBrowser = () => {
    let dragCounter = 0;

    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter++;
      if (e.dataTransfer?.types.includes("Files")) {
        isDragging.value = true;
      }
    };

    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) {
        isDragging.value = false;
      }
    };

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const onDropHandler = async (e: DragEvent) => {
      e.preventDefault();
      isDragging.value = false;
      dragCounter = 0;

      isProcessing.value = true;

      try {
        let files = await getFilesFromEvent(e);

        if (options?.acceptedExtensions?.length) {
          files = filterFilesByExtension(files, options.acceptedExtensions);
        }

        droppedFiles.value = files;
        options?.onDrop?.(files);
      }
      finally {
        isProcessing.value = false;
      }
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDropHandler);

    cleanup = () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDropHandler);
    };
  };

  onMounted(() => {
    if (IS_TAURI) {
      setupTauri();
    }
    else {
      setupBrowser();
    }
  });

  onUnmounted(() => {
    cleanup?.();
  });

  return {
    isDragging,
    droppedFiles,
    isProcessing,
  };
}
