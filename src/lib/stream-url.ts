import { convertFileSrc } from "@tauri-apps/api/core";

//
// URL helpers for the generalized `stream://` audio proxy. Paths are
// source-prefixed (`yt/<videoId>` today, `nd/…` with the Navidrome source);
// convertFileSrc maps the scheme per platform:
//   desktop (mac/linux):  stream://localhost/<encoded path>
//   windows/android:      http(s)://stream.localhost/<encoded path>
//

/** Builds the playable URL for a YouTube track routed through the proxy. */
export function ytStreamUrl(videoId: string): string {
  return convertFileSrc(`yt/${videoId}`, "stream");
}

/**
 * Extracts the video id from a `stream://…/yt/…` URL in any platform form.
 * Returns null for anything else (local files, nd streams, arbitrary URLs).
 */
export function ytVideoIdFromStreamUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const isStream = parsed.protocol === "stream:" || parsed.hostname === "stream.localhost";
    if (!isStream) return null;

    const path = decodeURIComponent(parsed.pathname).replace(/^\//, "");
    if (!path.startsWith("yt/")) return null;
    return path.slice("yt/".length) || null;
  }
  catch {
    return null;
  }
}

/**
 * One-time migration of queue snapshots persisted before the scheme was
 * generalized: `ytstream://localhost/<id>` (or `http://ytstream.localhost/<id>`
 * on windows/android) becomes the current platform's `stream://…/yt/<id>`.
 * Non-legacy URLs pass through untouched.
 */
export function migrateLegacyYtStreamUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isLegacy = parsed.protocol === "ytstream:" || parsed.hostname === "ytstream.localhost";
    if (!isLegacy) return url;

    const id = decodeURIComponent(parsed.pathname).replace(/^\//, "");
    return id ? ytStreamUrl(id) : url;
  }
  catch {
    return url;
  }
}
