import { remove } from "@tauri-apps/plugin-fs";
import { platformCaps } from "@/lib/environment/platformCaps";

/** Best-effort removal of a downloaded cache file after import. */
export async function cleanupCacheFile(absolutePath: string): Promise<void> {
  if (!platformCaps.hasFs) return;
  try {
    await remove(absolutePath);
  }
  catch {
    // Leftover cache file is non-fatal; the folder is cleaned on next import run.
  }
}
