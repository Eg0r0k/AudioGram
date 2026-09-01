import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock(import("@tauri-apps/api/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, invoke: mocks.invoke };
});

vi.mock(import("@/lib/environment/userAgent"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, IS_TAURI: true };
});

import {
  initMediaServerBase,
  localFileStreamUrl,
  migrateProxyUrl,
  ndCoverUrl,
  ndSongStreamUrl,
  proxyPathFromUrl,
  setMediaServerBaseForTests,
  ytImageUrl,
  ytStreamUrl,
  ytVideoIdFromStreamUrl,
} from "../stream-url";

const THUMB = "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg?sqp=abc&rs=def";
const THUMB_ENC = encodeURIComponent(THUMB);

const BASE = "http://127.0.0.1:4321/tokentokentokentokentokentokento";

beforeEach(() => {
  setMediaServerBaseForTests(BASE);
});

describe("initMediaServerBase", () => {
  it("fetches the base from the media_server_base command", async () => {
    setMediaServerBaseForTests(null);
    mocks.invoke.mockResolvedValueOnce("http://127.0.0.1:999/abc");

    await initMediaServerBase();

    expect(mocks.invoke).toHaveBeenCalledWith("media_server_base");
    expect(ytStreamUrl("dQw4w9WgXcQ")).toBe("http://127.0.0.1:999/abc/yt/dQw4w9WgXcQ");
  });
});

describe("builders", () => {
  it("build server URLs off the cached base", () => {
    expect(ytStreamUrl("dQw4w9WgXcQ")).toBe(`${BASE}/yt/dQw4w9WgXcQ`);
    expect(ndSongStreamUrl("s1")).toBe(`${BASE}/nd/song/s1`);
    expect(ndCoverUrl("al-al1", 300)).toBe(`${BASE}/nd/cover/al-al1?size=300`);
    expect(ndCoverUrl("al-al1")).toBe(`${BASE}/nd/cover/al-al1`);
  });

  it("percent-encodes ids and local paths", () => {
    expect(ndSongStreamUrl("s 1")).toBe(`${BASE}/nd/song/s%201`);
    expect(localFileStreamUrl("C:/music/a b.mp3"))
      .toBe(`${BASE}/local/C%3A%2Fmusic%2Fa%20b.mp3`);
    expect(localFileStreamUrl("/data/user/0/app/tracks/a.flac"))
      .toBe(`${BASE}/local/%2Fdata%2Fuser%2F0%2Fapp%2Ftracks%2Fa.flac`);
  });

  it("encodes a thumbnail URL, query included, as one ytimg segment", () => {
    expect(ytImageUrl(THUMB)).toBe(`${BASE}/ytimg/${THUMB_ENC}`);
    expect(ytImageUrl(THUMB)).not.toContain("?");
  });

  it("throw when the base was never initialized", () => {
    setMediaServerBaseForTests(null);
    expect(() => ytStreamUrl("dQw4w9WgXcQ")).toThrow(/media server/i);
  });
});

describe("proxyPathFromUrl", () => {
  it("parses current-session server URLs", () => {
    expect(proxyPathFromUrl(`${BASE}/yt/dQw4w9WgXcQ`)).toBe("yt/dQw4w9WgXcQ");
    expect(proxyPathFromUrl(`${BASE}/nd/song/s1`)).toBe("nd/song/s1");
  });

  it("parses previous-session server URLs (any port and token)", () => {
    expect(proxyPathFromUrl("http://127.0.0.1:60123/deadbeef/yt/dQw4w9WgXcQ"))
      .toBe("yt/dQw4w9WgXcQ");
  });

  it("no longer recognizes the retired custom schemes", () => {
    expect(proxyPathFromUrl("stream://localhost/yt%2FdQw4w9WgXcQ")).toBeNull();
    expect(proxyPathFromUrl("http://stream.localhost/nd%2Fsong%2Fs1")).toBeNull();
    expect(proxyPathFromUrl("ytstream://localhost/dQw4w9WgXcQ")).toBeNull();
    expect(proxyPathFromUrl(`ytimg://localhost/${THUMB_ENC}`)).toBeNull();
    expect(proxyPathFromUrl(`http://ytimg.localhost/${THUMB_ENC}`)).toBeNull();
  });

  it("keeps a real query when the server form carries one", () => {
    expect(proxyPathFromUrl(`${BASE}/nd/cover/al-1?size=300`)).toBe("nd/cover/al-1?size=300");
  });

  it("decodes the thumbnail URL out of the ytimg route", () => {
    expect(proxyPathFromUrl(`${BASE}/ytimg/${THUMB_ENC}`)).toBe(`ytimg/${THUMB}`);
  });

  it("returns null for non-proxy URLs", () => {
    expect(proxyPathFromUrl("https://example.com/yt/abc")).toBeNull();
    expect(proxyPathFromUrl("https://radio.example/stream.m3u8")).toBeNull();
    expect(proxyPathFromUrl("not a url")).toBeNull();
    expect(proxyPathFromUrl("http://127.0.0.1:4321/no-route")).toBeNull();
  });
});

describe("ytVideoIdFromStreamUrl", () => {
  it("round-trips the id through ytStreamUrl", () => {
    expect(ytVideoIdFromStreamUrl(ytStreamUrl("dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
  });

  it("extracts the id from a previous-session form", () => {
    expect(ytVideoIdFromStreamUrl("http://127.0.0.1:60123/deadbeef/yt/dQw4w9WgXcQ"))
      .toBe("dQw4w9WgXcQ");
  });

  it("rejects non-yt proxy paths and foreign URLs", () => {
    expect(ytVideoIdFromStreamUrl(`${BASE}/nd/song/s1`)).toBeNull();
    expect(ytVideoIdFromStreamUrl("http://127.0.0.1:60123/deadbeef/nd/song/1")).toBeNull();
    expect(ytVideoIdFromStreamUrl("https://example.com/yt/abc")).toBeNull();
    expect(ytVideoIdFromStreamUrl("not a url")).toBeNull();
    expect(ytVideoIdFromStreamUrl(null)).toBeNull();
  });
});

describe("migrateProxyUrl", () => {
  it("rebuilds every route of a previous session onto the current base", () => {
    expect(migrateProxyUrl("http://127.0.0.1:60123/deadbeef/yt/dQw4w9WgXcQ"))
      .toBe(`${BASE}/yt/dQw4w9WgXcQ`);
    expect(migrateProxyUrl("http://127.0.0.1:60123/deadbeef/nd/song/s1"))
      .toBe(`${BASE}/nd/song/s1`);
    expect(migrateProxyUrl("http://127.0.0.1:60123/deadbeef/nd/cover/al-1?size=300"))
      .toBe(`${BASE}/nd/cover/al-1?size=300`);
  });

  it("re-encodes local paths for the current base", () => {
    expect(migrateProxyUrl("http://127.0.0.1:60123/deadbeef/local/C%3A%2Fmusic%2Fa%20b.mp3"))
      .toBe(`${BASE}/local/C%3A%2Fmusic%2Fa%20b.mp3`);
  });

  it("moves thumbnails onto the current base without losing their query", () => {
    expect(migrateProxyUrl(`http://127.0.0.1:60123/deadbeef/ytimg/${THUMB_ENC}`))
      .toBe(`${BASE}/ytimg/${THUMB_ENC}`);
  });

  it("passes non-proxy URLs and unknown routes through untouched", () => {
    expect(migrateProxyUrl("https://radio.example/stream.m3u8"))
      .toBe("https://radio.example/stream.m3u8");
    expect(migrateProxyUrl("not a url")).toBe("not a url");
    expect(migrateProxyUrl("http://127.0.0.1:60123/deadbeef/nope")).toBe("http://127.0.0.1:60123/deadbeef/nope");
  });

  it("leaves proxy URLs untouched when the base is missing", () => {
    setMediaServerBaseForTests(null);
    const stale = "http://127.0.0.1:60123/deadbeef/yt/dQw4w9WgXcQ";
    expect(migrateProxyUrl(stale)).toBe(stale);
  });
});
