import { describe, expect, it, vi } from "vitest";

vi.mock(import("@tauri-apps/api/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Mirrors the desktop (non-windows) shape incl. the path encoding the real
    // implementation applies.
    convertFileSrc: (path: string, scheme: string) =>
      `${scheme}://localhost/${encodeURIComponent(path)}`,
  };
});

import { migrateLegacyYtStreamUrl, ytStreamUrl, ytVideoIdFromStreamUrl } from "../stream-url";

describe("ytStreamUrl", () => {
  it("builds a source-prefixed stream:// URL", () => {
    expect(ytStreamUrl("dQw4w9WgXcQ")).toBe("stream://localhost/yt%2FdQw4w9WgXcQ");
  });
});

describe("ytVideoIdFromStreamUrl", () => {
  it("round-trips the id through ytStreamUrl", () => {
    expect(ytVideoIdFromStreamUrl(ytStreamUrl("dQw4w9WgXcQ"))).toBe("dQw4w9WgXcQ");
  });

  it("parses the windows/android host form", () => {
    expect(ytVideoIdFromStreamUrl("http://stream.localhost/yt%2FdQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(ytVideoIdFromStreamUrl("https://stream.localhost/yt/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non-stream URLs, foreign prefixes and malformed input", () => {
    expect(ytVideoIdFromStreamUrl("https://example.com/yt/abc")).toBeNull();
    expect(ytVideoIdFromStreamUrl("stream://localhost/nd/song/1")).toBeNull();
    expect(ytVideoIdFromStreamUrl("ytstream://localhost/abc")).toBeNull();
    expect(ytVideoIdFromStreamUrl("not a url")).toBeNull();
    expect(ytVideoIdFromStreamUrl(null)).toBeNull();
  });
});

describe("migrateLegacyYtStreamUrl", () => {
  it("rewrites the legacy desktop form onto the generalized scheme", () => {
    expect(migrateLegacyYtStreamUrl("ytstream://localhost/dQw4w9WgXcQ"))
      .toBe("stream://localhost/yt%2FdQw4w9WgXcQ");
  });

  it("rewrites the legacy windows/android host form", () => {
    expect(migrateLegacyYtStreamUrl("http://ytstream.localhost/dQw4w9WgXcQ"))
      .toBe("stream://localhost/yt%2FdQw4w9WgXcQ");
  });

  it("passes non-legacy URLs through untouched", () => {
    const current = "stream://localhost/yt%2FdQw4w9WgXcQ";
    expect(migrateLegacyYtStreamUrl(current)).toBe(current);
    expect(migrateLegacyYtStreamUrl("https://radio.example/stream.m3u8"))
      .toBe("https://radio.example/stream.m3u8");
    expect(migrateLegacyYtStreamUrl("not a url")).toBe("not a url");
  });
});
