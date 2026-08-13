import { describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { TrackId } from "@/types/ids";
import { ytTrackId } from "@/types/track-ref";

const providerState = vi.hoisted(() => ({ isAvailable: false }));

vi.mock(import("@tauri-apps/api/core"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    convertFileSrc: (path: string, scheme: string) => `${scheme}://localhost/${path}`,
  };
});

vi.mock("@/modules/youtube/provider", () => ({
  youtubeProvider: {
    get isAvailable() {
      return providerState.isAvailable;
    },
    resolve: vi.fn((id: string) => okAsync(id)),
    download: vi.fn(() => okAsync({ path: "C:/tmp/a.m4a" })),
    searchMusic: vi.fn(() => okAsync({ items: [], continuation: null, total: null, correctedQuery: null })),
  },
}));

import { sources } from "../registry";
import { ytSourceProvider } from "../providers/yt.provider";

describe("sources registry", () => {
  it("returns the yt provider by kind and via forTrack on a yt: id", () => {
    expect(sources.get("yt")).toBe(ytSourceProvider);
    expect(sources.forTrack(ytTrackId("dQw4w9WgXcQ"))).toBe(ytSourceProvider);
  });

  it("throws for kinds without a registered provider", () => {
    expect(() => sources.get("nd")).toThrow(/No source provider registered/);
    expect(() => sources.forTrack(TrackId("nd:song1"))).toThrow(/No source provider registered/);
    expect(() => sources.forTrack(TrackId("plain-local-uuid"))).toThrow(/No source provider registered/);
  });

  it("available() reflects the underlying provider availability", () => {
    providerState.isAvailable = false;
    expect(sources.available()).toEqual([]);

    providerState.isAvailable = true;
    expect(sources.available()).toEqual([ytSourceProvider]);
  });
});

describe("ytSourceProvider", () => {
  it("rejects non-yt ids with a PARSE error before hitting the backend", async () => {
    const result = await ytSourceProvider.resolveStreamUrl(TrackId("nd:song1"));

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
  });

  it("resolves yt ids into a proxied stream URL", async () => {
    const result = await ytSourceProvider.resolveStreamUrl(ytTrackId("dQw4w9WgXcQ"));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toBe("stream://localhost/yt/dQw4w9WgXcQ");
  });

  it("downloads through the youtube provider and returns the file path", async () => {
    const result = await ytSourceProvider.downloadToFile(ytTrackId("dQw4w9WgXcQ"));

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ path: "C:/tmp/a.m4a" });
  });

  it("reports unsupported browsing as UNAVAILABLE", async () => {
    const result = await ytSourceProvider.listArtists();

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().kind).toBe("UNAVAILABLE");
  });

  it("returns an empty page (not an error) for offset pages beyond the first", async () => {
    const result = await ytSourceProvider.search("query", ["track"], { offset: 50, limit: 50 });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ tracks: [], albums: [], artists: [] });
  });
});
