import { IS_TAURI } from "@/lib/environment/userAgent";
import { filterFilesByExtension } from "@/lib/files/filterFiles";
import { getFilesFromEvent } from "@/lib/files/getFilesFromEvent";
import { ref, onMounted } from "vue";
import { useTauriDragDrop } from "./tauri/useTauriDragDrop";
import { getLogger } from "@/lib/logger";

export interface UseFileDropOptions {
  acceptedExtensions?: string[];
  onDrop?: (files: File[]) => void;
}

type DropFs = Pick<typeof import("@tauri-apps/plugin-fs"), "readDir" | "stat">;

const matchesExtension = (path: string, extensions?: string[]): boolean => {
  if (!extensions?.length) return true;
  return extensions.some(ext => path.toLowerCase().endsWith(ext.toLowerCase()));
};

/**
 * Every accepted file under a directory, recursively. A subtree that cannot
 * be read is logged and skipped: one unreadable folder must not lose the
 * rest of the drop.
 */
const collectFiles = async (
  fs: DropFs,
  dirPath: string,
  extensions?: string[],
): Promise<string[]> => {
  const files: string[] = [];
  try {
    const entries = await fs.readDir(dirPath);
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory) {
        files.push(...(await collectFiles(fs, fullPath, extensions)));
      }
      else if (entry.isFile && matchesExtension(entry.name, extensions)) {
        files.push(fullPath);
      }
    }
  }
  catch (e) {
    getLogger().error(`[FileDrop] Reading directory ${dirPath} failed: ${String(e)}`);
  }
  return files;
};

/** Dropped paths flattened into files: directories are walked, files filtered. */
const collectDroppedPaths = async (
  fs: DropFs,
  paths: string[],
  extensions?: string[],
): Promise<string[]> => {
  const result: string[] = [];
  for (const path of paths) {
    try {
      const info = await fs.stat(path);
      if (info.isDirectory) {
        result.push(...(await collectFiles(fs, path, extensions)));
      }
      else if (info.isFile && matchesExtension(path, extensions)) {
        result.push(path);
      }
    }
    catch (e) {
      getLogger().error(`[FileDrop] Processing path ${path} failed: ${String(e)}`);
    }
  }
  return result;
};

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
          const fs = await import("@tauri-apps/plugin-fs");
          const paths = await collectDroppedPaths(fs, payload.paths, options?.acceptedExtensions);
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
