import { IS_MOBILE, IS_TAURI } from "./userAgent";

//
// Platform capabilities — what this runtime can DO, not what it IS. Gate
// features on the capability they actually need (the pattern of
// SourceCapabilities / TrackMenuCaps / hasNativeSupport) instead of raw
// IS_TAURI checks, so a future runtime (PWA with FS access, mobile shell
// without shell-spawn) flips one flag here rather than 50 call sites.
// Pure UI cosmetics (window chrome paddings, etc.) may keep IS_TAURI.
//

export const platformCaps = {
  /** Native filesystem: managed storage, offline copies, watched folders,
   * path-based playback. */
  hasFs: IS_TAURI,
  /** Spawning helper processes (yt-dlp) — desktop only. */
  canShellSpawn: IS_TAURI && !IS_MOBILE,
  /** Proxying remote streams/covers through the Rust HTTP layer (ND
   * source, YT thumbnails). */
  canProxyStream: IS_TAURI,
  /** Discord Rich Presence over local IPC — desktop only. */
  hasDiscord: IS_TAURI && !IS_MOBILE,
  /** Native window integration: title updates, tray. */
  hasNativeWindow: IS_TAURI,
} as const;

export type PlatformCaps = typeof platformCaps;
