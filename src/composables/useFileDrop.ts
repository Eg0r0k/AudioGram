import { IS_TAURI } from "@/helpers/environment/userAgent";
import { filterFilesByExtension } from "@/helpers/files/filterFiles";
import { getFilesFromEvent } from "@/helpers/files/getFilesFromEvent";
import { ref, onMounted } from "vue";
import { useTauriDragDrop } from "./tauri/useTauriDragDrop";

export interface UseFileDropOptions {
  acceptedExtensions?: string[];
  onDrop?: (files: File[]) => void;
}

export function useFileDrop(options?: UseFileDropOptions) {
  const isDragging = ref(false);
  const droppedFiles = ref<File[]>([]);
  const isProcessing = ref(false);

  const setupTauri = async () => {
    useTauriDragDrop(async (payload) => {
      if (payload.type === "over" || payload.type === "enter") {
        isDragging.value = true;
      }
      else if (payload.type === "leave") {
        isDragging.value = false;
      }
      else if (payload.type === "drop") {
        isDragging.value = false;
        isProcessing.value = true;

        try {
          const { readDir, stat } = await import("@tauri-apps/plugin-fs");

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
              console.error("Error reading directory:", e);
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
                console.error("Error processing path:", e);
              }
            }
            return result;
          };

          const paths = await processPaths(payload.paths);
          const files = paths.map((path) => {
            const name = path.split(/[/\\]/).pop() || path;
            return Object.assign(new File([], name), {
              path,
              relativePath: path,
            }) as File & { path: string };
          });

          droppedFiles.value = files;
          options?.onDrop?.(files);
        }
        finally {
          isProcessing.value = false;
        }
      }
    });
  };

  const setupBrowser = async () => {
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
    const { useEventListener } = await import("@vueuse/core");

    useEventListener(document, "dragenter", onDragEnter, { passive: false });
    useEventListener(document, "dragleave", onDragLeave, { passive: false });
    useEventListener(document, "dragover", onDragOver, { passive: false });
    useEventListener(document, "drop", onDropHandler, { passive: false });
  };

  onMounted(async () => {
    if (IS_TAURI) {
      await setupTauri();
    }
    else {
      await setupBrowser();
    }
  });

  return {
    isDragging,
    droppedFiles,
    isProcessing,
  };
}
