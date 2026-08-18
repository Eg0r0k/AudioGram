import { normalizePath } from "@/lib/files/filterFiles";
import { ScannedFile } from "@/types/watched-folders";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import { isValidImportItem } from "@/lib/environment/mimeSupport";

export async function scanFolder(
  folderPath: string,
  signal?: AbortSignal,
  excludedPaths?: Set<string>,
): Promise<ScannedFile[]> {
  const results: ScannedFile[] = [];
  const stack = [normalizePath(folderPath)];

  while (stack.length > 0) {
    signal?.throwIfAborted();

    const currentDir = stack.pop()!;

    let entries;
    try {
      entries = await readDir(currentDir);
    }
    catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = `${currentDir}/${entry.name}`;

      if (entry.isDirectory) {
        const normalizedFull = normalizePath(fullPath);
        if (excludedPaths?.has(normalizedFull)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile || !isValidImportItem(entry.name)) continue;

      try {
        const meta = await stat(fullPath);
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";

        results.push({
          absolutePath: normalizePath(fullPath),
          name: entry.name,
          ext,
          size: meta.size,
          modifiedAt: meta.mtime?.getTime() ?? Date.now(),
        });
      }
      catch {
        // File might have been deleted between readDir and stat
      }
    }
  }

  return results;
}
