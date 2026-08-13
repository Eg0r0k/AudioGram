import { remove } from "@tauri-apps/plugin-fs";
import { IS_TAURI } from "@/lib/environment/userAgent";

/** Best-effort removal of a downloaded cache file after import. */
export async function cleanupCacheFile(absolutePath: string): Promise<void> {
  if (!IS_TAURI) return;
  try {
    await remove(absolutePath);
  }
  catch {
    // Leftover cache file is non-fatal; the folder is cleaned on next import run.
  }
}
