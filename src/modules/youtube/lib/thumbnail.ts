import { platformCaps } from "@/lib/environment/platformCaps";
import { proxyPathFromUrl, ytImageUrl } from "@/lib/stream-url";
import { THUMB_SIZE_FULL } from "@/lib/media/cover-sizes";

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
 * Recovers the original https thumbnail URL from one proxied through the
 * `ytimg/<enc url>` server route. Non-proxied URLs pass through unchanged;
 * anything that is not a URL at all yields null.
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
