import { watch as fsWatch, exists } from "@tauri-apps/plugin-fs";
import { useDebounceFn } from "@vueuse/core";
import { isValidImportItem } from "@/lib/environment/mimeSupport";
import { normalizePath } from "@/lib/files/filterFiles";
import { getLogger } from "@/lib/logger";

export type FileChangeHandler = (paths: string[]) => void;
export type FolderMissingHandler = () => void;
export type StopWatchFn = () => void;

export async function startWatching(
  folderPath: string,
  onChange: FileChangeHandler,
  onFolderMissing: FolderMissingHandler,
  excludedPaths?: string[],
): Promise<StopWatchFn> {
  const debouncedHandler = useDebounceFn(async (changedPaths: string[]) => {
    const folderExists = await exists(folderPath);
    if (!folderExists) {
      onFolderMissing();
      return;
    }

    const audioPaths = changedPaths
      .map(normalizePath)
      .filter((p) => {
        if (!isValidImportItem(p.split("/").pop() ?? "")) return false;
        if (excludedPaths) {
          for (const excluded of excludedPaths) {
            if (p.startsWith(excluded + "/")) return false;
          }
        }
        return true;
      });

    if (audioPaths.length > 0) {
      onChange(audioPaths);
    }
  }, 1500);

  let unwatch: (() => void) | null = null;

  try {
    unwatch = await fsWatch(
      folderPath,
      (event) => {
        if (event.paths.length > 0) {
          debouncedHandler(event.paths).catch(error => getLogger().error(`[WatchedFolders] Handling a change in ${folderPath} failed: ${String(error)}`));
        }
      },
      { recursive: true, delayMs: 1000 },
    );
  }
  catch {
    onFolderMissing();
    return () => {};
  }

  return () => {
    unwatch();
  };
}
