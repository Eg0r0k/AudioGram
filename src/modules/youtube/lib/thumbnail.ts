import { convertFileSrc } from "@tauri-apps/api/core";
import { IS_TAURI } from "@/lib/environment/userAgent";

/**
 * Routes a YouTube thumbnail URL through the `ytimg://` scheme so the Rust
 * side fetches it honoring the configured proxy. `<img>` loads in the webview
 * go straight to the network and bypass the app proxy otherwise. No-op on web.
 */
export function proxiedThumbnail(url: string): string {
  if (!IS_TAURI) return url;
  return convertFileSrc(url, "ytimg");
}
