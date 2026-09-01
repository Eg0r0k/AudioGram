import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "@/lib/environment/userAgent";

//
// URL helpers for the loopback media server — the transport for all audio
// and proxied covers. The Rust side binds `127.0.0.1:{random port}` before
// the webview exists and guards every route with a per-launch token:
//
//   http://127.0.0.1:{port}/{token}/yt/<videoId>
//   http://127.0.0.1:{port}/{token}/nd/song/<songId>
//   http://127.0.0.1:{port}/{token}/local/<encoded absolute path>
//   http://127.0.0.1:{imagePort}/{token}/nd/cover/<coverId>?size=<px>
//   http://127.0.0.1:{imagePort}/{token}/ytimg/<encoded https thumbnail url>
//
// Images live on a second port of the same server: the webview allows six
// connections per host, and a burst of slow proxied covers used to hold all
// six while the media element's request for a local file queued behind them.
//
// The bases are fetched ONCE at bootstrap (top-level await in main.ts), so
// the builders stay synchronous. Ports and token change every launch —
// server URLs must never be persisted as-is; `migrateProxyUrl` rebuilds any
// stored proxy URL onto the live base.
//

let serverBase: string | null = null;
let imageBase: string | null = null;

/**
 * Fetches `http://127.0.0.1:{port}/{token}` from the backend. Must complete
 * before anything builds a media URL — main.ts awaits it before mounting.
 * No-op outside Tauri (the web build has no server and no sources that
 * would need one).
 */
export const initMediaServerBase = async (): Promise<void> => {
  if (!IS_TAURI) return;
  [serverBase, imageBase] = await Promise.all([
    invoke<string>("media_server_base"),
    invoke<string>("image_server_base"),
  ]);
};

/** Test seam: the bases are process-global, tests set them directly. */
export const setMediaServerBaseForTests = (base: string | null, images: string | null = base): void => {
  serverBase = base;
  imageBase = images;
};

const requireBase = (): string => {
  if (!serverBase) {
    throw new Error("media server base is not initialized — initMediaServerBase must run at bootstrap");
  }
  return serverBase;
};

const requireImageBase = (): string => {
  if (!imageBase) {
    throw new Error("image server base is not initialized — initMediaServerBase must run at bootstrap");
  }
  return imageBase;
};

/** Builds the playable URL for a YouTube track routed through the server. */
export const ytStreamUrl = (videoId: string): string => {
  return `${requireBase()}/yt/${encodeURIComponent(videoId)}`;
};

/** Builds the playable URL for a Navidrome song routed through the server. */
export const ndSongStreamUrl = (songId: string): string => {
  return `${requireBase()}/nd/song/${encodeURIComponent(songId)}`;
};

/**
 * Builds the playable URL for a local file. The whole absolute path rides as
 * ONE encoded segment; the Rust side percent-decodes it back.
 */
export const localFileStreamUrl = (absolutePath: string): string => {
  return `${requireBase()}/local/${encodeURIComponent(absolutePath)}`;
};

/** Builds the proxied Navidrome cover URL. */
export const ndCoverUrl = (coverId: string, size?: number): string => {
  const query = size ? `?size=${size}` : "";
  return `${requireImageBase()}/nd/cover/${encodeURIComponent(coverId)}${query}`;
};

/**
 * Builds the proxied YouTube thumbnail URL. The whole https URL rides as ONE
 * encoded segment (it may carry its own query); the Rust side percent-decodes
 * it back and enforces the host allowlist.
 */
export const ytImageUrl = (thumbnailUrl: string): string => {
  return `${requireImageBase()}/ytimg/${encodeURIComponent(thumbnailUrl)}`;
};

const KNOWN_ROUTES = /^(yt|nd\/song|nd\/cover|local|ytimg)\//;

/**
 * Recognizes a server URL from this or any previous session
 * (`http://127.0.0.1:{port}/{token}/…`, any port and token) and returns the
 * decoded route path (`yt/<id>`, `nd/song/<id>`, `nd/cover/<id>?size=<px>`,
 * `local/<abs path>`, `ytimg/<https url>`), or null for anything that is not
 * a proxy URL.
 */
export const proxyPathFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1") return null;

    // Strip the (session-specific) token segment.
    const path = decodeURIComponent(parsed.pathname).replace(/^\//, "");
    const slash = path.indexOf("/");
    if (slash === -1) return null;

    const withQuery = `${path.slice(slash + 1)}${parsed.search}`;
    return KNOWN_ROUTES.test(withQuery) ? withQuery : null;
  }
  catch {
    return null;
  }
};

/**
 * Extracts the video id from a proxied YouTube URL (see
 * {@link proxyPathFromUrl}). Returns null for anything else (local files,
 * nd streams, arbitrary URLs).
 */
export const ytVideoIdFromStreamUrl = (url: string | null | undefined): string | null => {
  const path = proxyPathFromUrl(url);
  if (!path) return null;
  const match = /^yt\/([^?#]+)/.exec(path);
  return match ? match[1] : null;
};

/**
 * Rebuilds any stored proxy URL onto the CURRENT session's base — the port
 * and token change every launch, so persisted queue snapshots (and their
 * cover fields) are re-pointed here on restore. Non-proxy URLs (radio, plain
 * https) pass through untouched, as does everything when the base is not
 * available (web build).
 */
export const migrateProxyUrl = (url: string): string => {
  if (!serverBase) return url;
  const path = proxyPathFromUrl(url);
  if (!path) return url;

  // Before the query split: the thumbnail URL may carry a query of its own.
  const ytimg = path.startsWith("ytimg/") ? path.slice("ytimg/".length) : null;
  if (ytimg) return ytImageUrl(ytimg);

  const [route, query = ""] = path.split("?", 2);

  const yt = route.startsWith("yt/") ? route.slice("yt/".length) : null;
  if (yt) return ytStreamUrl(yt);

  const ndSong = route.startsWith("nd/song/") ? route.slice("nd/song/".length) : null;
  if (ndSong) return ndSongStreamUrl(ndSong);

  const ndCover = route.startsWith("nd/cover/") ? route.slice("nd/cover/".length) : null;
  if (ndCover) {
    const size = /(?:^|&)size=(\d+)/.exec(query)?.[1];
    return ndCoverUrl(ndCover, size ? Number(size) : undefined);
  }

  const local = route.startsWith("local/") ? route.slice("local/".length) : null;
  if (local) return localFileStreamUrl(local);

  return url;
};
