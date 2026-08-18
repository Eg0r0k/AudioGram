import { IS_MOBILE, IS_TAURI } from "./userAgent";

// Platform capabilities — what this runtime can do, not what it is. Gate
// features on these instead of raw IS_TAURI checks; UI cosmetics may keep
// IS_TAURI.

export const platformCaps = {
  /** Native filesystem: managed storage, offline copies, watched folders. */
  hasFs: IS_TAURI,
  /** Spawning helper processes (yt-dlp). */
  canShellSpawn: IS_TAURI && !IS_MOBILE,
  /** Proxying remote streams/covers through the Rust HTTP layer. */
  canProxyStream: IS_TAURI && !IS_MOBILE,
  /** Discord Rich Presence over local IPC. */
  hasDiscord: IS_TAURI && !IS_MOBILE,
  /** Native window integration: title updates, tray. */
  hasNativeWindow: IS_TAURI && !IS_MOBILE,
  /** The desktop updater (check_update/install_update commands). */
  hasAppUpdater: IS_TAURI && !IS_MOBILE,
} as const;

export type PlatformCaps = typeof platformCaps;
