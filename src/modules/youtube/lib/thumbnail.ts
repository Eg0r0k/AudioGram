import { platformCaps } from "@/lib/environment/platformCaps";
import { proxyPathFromUrl, ytImageUrl } from "@/lib/stream-url";

/**
 * googleusercontent/ggpht covers are served at the size encoded in the URL,
 * and YT Music search/browse payloads only carry tiny renditions (w60–w120)
 * that look crushed once rendered on a hidpi screen. The CDN serves any
 * requested size, so rewrite the size params to a sharp rendition.
 */
function upscaledThumbnail(url: string, size: number): string {
  if (!/\.(?:googleusercontent|ggpht)\.com\//.test(url)) return url;
  return url
    .replace(/=w\d+-h\d+/, `=w${size}-h${size}`)
    .replace(/=s\d+/, `=s${size}`);
}

/** Hero/full-cover rendition (YT Music's standard album cover size). */
export const THUMB_SIZE_FULL = 544;
/** Card rendition (~144px cards on hidpi screens). */
export const THUMB_SIZE_CARD = 320;
/** List-row rendition — plenty for 40–56px covers on hidpi screens. */
export const THUMB_SIZE_ROW = 226;

/**
 * Routes a YouTube thumbnail URL through the media server's `ytimg` route so
 * the Rust side fetches it honoring the configured proxy. `<img>` loads in
 * the webview go straight to the network and bypass the app proxy otherwise.
 * No-op on web and mobile (the route lives in the desktop-only youtube module).
 *
 * `size` picks the CDN rendition — request only what the layout needs so long
 * lists don't decode hero-sized covers per row.
 */
export function proxiedThumbnail(url: string, size: number = THUMB_SIZE_FULL): string {
  const sharp = upscaledThumbnail(url, size);
  if (!platformCaps.canShellSpawn) return sharp;
  return ytImageUrl(sharp);
}

/**
 * Recovers the original https thumbnail URL from a proxied one — the current
 * `ytimg/<enc url>` server route or the legacy `ytimg://` scheme persisted in
 * older queue snapshots. Non-proxied URLs pass through unchanged; anything
 * that is not a URL at all yields null.
 */
export function unproxiedThumbnail(url: string | null | undefined): string | null {
  if (!url) return null;
  const route = proxyPathFromUrl(url);
  if (route?.startsWith("ytimg/")) return route.slice("ytimg/".length);
  try {
    new URL(url);
    return url;
  }
  catch {
    return null;
  }
}
