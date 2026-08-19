import { IS_MOBILE, IS_TAURI } from "./userAgent";

// Platform capabilities — what this runtime can do, not what it is. Gate
// features on these instead of raw IS_TAURI checks; UI cosmetics may keep
// IS_TAURI.

export const platformCaps = {
  /** Native filesystem: managed storage, offline copies, watched folders. */
  hasFs: IS_TAURI,
  /** Spawning helper processes (yt-dlp). */
  canShellSpawn: IS_TAURI && !IS_MOBILE,
  /** Proxying remote streams/covers through the Rust `stream://` layer. */
  canProxyStream: IS_TAURI,
  /** Discord Rich Presence over local IPC. */
  hasDiscord: IS_TAURI && !IS_MOBILE,
  /** Native window integration: title updates, tray. */
  hasNativeWindow: IS_TAURI && !IS_MOBILE,
  /** In-app updates: the desktop updater plugin or the Android APK flow. */
  hasAppUpdater: IS_TAURI,
  /** Webview zoom control (desktop webviews only). */
  hasZoom: IS_TAURI && !IS_MOBILE,
} as const;

export type PlatformCaps = typeof platformCaps;
