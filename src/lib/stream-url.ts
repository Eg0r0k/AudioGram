import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "@/lib/environment/userAgent";

//
// URL helpers for the loopback media server — the transport for all audio
// and proxied covers. The Rust side binds `127.0.0.1:{random port}` before
// the webview exists and guards every route with a per-launch token:
//
//   http://127.0.0.1:{port}/{token}/yt/<videoId>
//   http://127.0.0.1:{port}/{token}/nd/song/<songId>
//   http://127.0.0.1:{port}/{token}/nd/cover/<coverId>?size=<px>
//   http://127.0.0.1:{port}/{token}/local/<encoded absolute path>
//
// The base is fetched ONCE at bootstrap (top-level await in main.ts), so the
// builders stay synchronous. Port and token change every launch — server
// URLs must never be persisted as-is; `migrateProxyUrl` rebuilds any stored
// proxy URL (current or legacy `stream://`-era forms) onto the live base.
//

let serverBase: string | null = null;

/**
 * Fetches `http://127.0.0.1:{port}/{token}` from the backend. Must complete
 * before anything builds a media URL — main.ts awaits it before mounting.
 * No-op outside Tauri (the web build has no server and no sources that
 * would need one).
 */
export const initMediaServerBase = async (): Promise<void> => {
  if (!IS_TAURI) return;
  serverBase = await invoke<string>("media_server_base");
};

/** Test seam: the base is process-global, tests set it directly. */
export const setMediaServerBaseForTests = (base: string | null): void => {
  serverBase = base;
};

const requireBase = (): string => {
  if (!serverBase) {
    throw new Error("media server base is not initialized — initMediaServerBase must run at bootstrap");
  }
  return serverBase;
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
  return `${requireBase()}/nd/cover/${encodeURIComponent(coverId)}${query}`;
};

const KNOWN_ROUTES = /^(yt|nd\/song|nd\/cover|local)\//;

/**
 * Recognizes every current and historical proxy URL shape and returns the
 * decoded route path (`yt/<id>`, `nd/song/<id>`, `nd/cover/<id>?size=<px>`,
 * `local/<abs path>`), or null for anything that never was a proxy URL:
 *
 * - current/previous-session server: `http://127.0.0.1:{port}/{token}/…`
 * - generalized scheme: `stream://localhost/<enc path>` and
 *   `http(s)://stream.localhost/<enc path>` (windows/android form)
 * - pre-generalization: `ytstream://localhost/<videoId>` and
 *   `http(s)://ytstream.localhost/<videoId>`
 */
export const proxyPathFromUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const isYtLegacy = parsed.protocol === "ytstream:" || parsed.hostname === "ytstream.localhost";
    const isStreamLegacy = parsed.protocol === "stream:" || parsed.hostname === "stream.localhost";
    const isServer = parsed.hostname === "127.0.0.1";
    if (!isYtLegacy && !isStreamLegacy && !isServer) return null;

    let path = decodeURIComponent(parsed.pathname).replace(/^\//, "");

    if (isServer) {
      // Strip the (session-specific) token segment.
      const slash = path.indexOf("/");
      if (slash === -1) return null;
      path = path.slice(slash + 1);
    }
    if (isYtLegacy) {
      return path ? `yt/${path}` : null;
    }

    const withQuery = `${path}${parsed.search}`;
    return KNOWN_ROUTES.test(withQuery) ? withQuery : null;
  }
  catch {
    return null;
  }
};

/**
 * Extracts the video id from any proxy-form YouTube URL (see
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
