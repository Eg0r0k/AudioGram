import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { AlbumId, TrackId } from "@/types/ids";
import { ndAlbumId, ndTrackId } from "@/types/track-ref";

const subsonicFetchMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());
const configState = vi.hoisted(() => ({
  // Mock config for tests only — never a real credential.
  current: { baseUrl: "https://demo.example", username: "joe", password: "sesame" } as object | null,
}));

vi.mock("../navidrome/api/subsonic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../navidrome/api/subsonic")>();
  return { ...actual, subsonicFetch: subsonicFetchMock };
});
vi.mock("../navidrome/config", () => ({
  getNdConfig: () => configState.current,
}));
vi.mock(import("@tauri-apps/api/core"), async (importOriginal) => {
  const actual = await importOriginal();
  // The real Channel registers itself in __TAURI_INTERNALS__ — absent here.
  class MockChannel {
    onmessage: ((event: unknown) => void) | undefined;
  }
  return {
    ...actual,
    convertFileSrc: (path: string, scheme: string) => `${scheme}://localhost/${path}`,
    invoke: invokeMock,
    Channel: MockChannel as unknown as typeof actual.Channel,
  };
});

import { setMediaServerBaseForTests } from "@/lib/stream-url";
import { ndSourceProvider } from "../providers/nd.provider";

const MEDIA_BASE = "http://127.0.0.1:4321/tok";
setMediaServerBaseForTests(MEDIA_BASE);

describe("ndSourceProvider", () => {
  beforeEach(() => {
    subsonicFetchMock.mockReset();
    invokeMock.mockReset();
    configState.current = { baseUrl: "https://demo.example", username: "joe", password: "sesame" };
  });

  it("is unavailable without a config and fails calls with UNAVAILABLE", async () => {
    configState.current = null;

    expect(ndSourceProvider.isAvailable).toBe(false);
    const result = await ndSourceProvider.listArtists();
    expect(result._unsafeUnwrapErr().kind).toBe("UNAVAILABLE");
    expect(subsonicFetchMock).not.toHaveBeenCalled();
  });

  it("flattens the getArtists index preserving server order (ignoredArticles)", async () => {
    subsonicFetchMock.mockReturnValue(okAsync({
      artists: {
        ignoredArticles: "The El La",
        index: [
          { name: "B", artist: [{ id: "ar1", name: "The Beatles", albumCount: 12 }] },
          { name: "Z", artist: [{ id: "ar2", name: "Zaz", coverArt: "ar-ar2" }] },
        ],
      },
    }));

    const result = await ndSourceProvider.listArtists();

    expect(result._unsafeUnwrap()).toEqual([
      { id: "nd:ar1", name: "The Beatles", albumCount: 12, coverRef: undefined },
      { id: "nd:ar2", name: "Zaz", albumCount: undefined, coverRef: "ar-ar2" },
    ]);
    expect(subsonicFetchMock).toHaveBeenCalledWith(configState.current, "getArtists");
  });

  it("pages getAlbumList2 with the sort mapped and size capped at 500", async () => {
    subsonicFetchMock.mockReturnValue(okAsync({ albumList2: { album: [] } }));

    await ndSourceProvider.listAlbums({ offset: 500, limit: 1000, sort: "newest" });

    expect(subsonicFetchMock).toHaveBeenCalledWith(configState.current, "getAlbumList2", {
      type: "newest",
      size: 500,
      offset: 500,
    });

    await ndSourceProvider.listAlbums({ offset: 0, limit: 50, sort: "alpha" });
    expect(subsonicFetchMock).toHaveBeenLastCalledWith(configState.current, "getAlbumList2", {
      type: "alphabeticalByName",
      size: 50,
      offset: 0,
    });
  });

  it("maps getAlbum onto branded ids and normalized track DTOs", async () => {
    subsonicFetchMock.mockReturnValue(okAsync({
      album: {
        id: "al1",
        name: "Abbey Road",
        artist: "The Beatles",
        artistId: "ar1",
        year: 1969,
        coverArt: "al-al1",
        songCount: 2,
        song: [
          { id: "s1", title: "Come Together", album: "Abbey Road", albumId: "al1", artist: "The Beatles", artistId: "ar1", duration: 259, track: 1, coverArt: "al-al1", suffix: "flac", bitRate: 1024 },
          { id: "s2", title: "Something", duration: 182, track: 2 },
        ],
      },
    }));

    const result = await ndSourceProvider.getAlbum(ndAlbumId("al1"));

    const { album, tracks } = result._unsafeUnwrap();
    expect(album).toEqual({
      id: "nd:al1",
      title: "Abbey Road",
      artistId: "nd:ar1",
      artistName: "The Beatles",
      year: 1969,
      coverRef: "al-al1",
      trackCount: 2,
    });
    expect(tracks[0]).toEqual({
      id: "nd:s1",
      title: "Come Together",
      artistName: "The Beatles",
      albumTitle: "Abbey Road",
      albumId: "nd:al1",
      artistIds: ["nd:ar1"],
      duration: 259,
      trackNo: 1,
      discNo: undefined,
      coverRef: "al-al1",
      format: { codec: "flac", bitrate: 1024 },
    });
    expect(tracks[1]).toMatchObject({ id: "nd:s2", albumId: undefined, artistIds: undefined, format: undefined });
  });

  it("rejects foreign ids with PARSE before any request", async () => {
    expect((await ndSourceProvider.getAlbum(AlbumId("yt:x")))._unsafeUnwrapErr().kind).toBe("PARSE");
    expect((await ndSourceProvider.getTrack(TrackId("local-uuid")))._unsafeUnwrapErr().kind).toBe("PARSE");
    expect((await ndSourceProvider.resolveStreamUrl(TrackId("yt:x")))._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(subsonicFetchMock).not.toHaveBeenCalled();
  });

  it("search3 requests only the asked entity types and maps all three lists", async () => {
    subsonicFetchMock.mockReturnValue(okAsync({
      searchResult3: {
        song: [{ id: "s1", title: "Hit" }],
        album: [{ id: "al1", name: "Hits" }],
        artist: [{ id: "ar1", name: "Hitmaker" }],
      },
    }));

    const result = await ndSourceProvider.search("hit", ["track", "album"], { offset: 20, limit: 10 });

    expect(subsonicFetchMock).toHaveBeenCalledWith(configState.current, "search3", {
      query: "hit",
      songCount: 10,
      songOffset: 20,
      albumCount: 10,
      albumOffset: 20,
      artistCount: 0,
      artistOffset: 20,
    });
    const { tracks, albums, artists } = result._unsafeUnwrap();
    expect(tracks[0]?.id).toBe("nd:s1");
    expect(albums[0]?.id).toBe("nd:al1");
    expect(artists[0]?.id).toBe("nd:ar1");
  });

  it("builds stream and cover URLs through the media server", async () => {
    const stream = await ndSourceProvider.resolveStreamUrl(ndTrackId("s1"));
    expect(stream._unsafeUnwrap()).toBe(`${MEDIA_BASE}/nd/song/s1`);

    expect(ndSourceProvider.coverUrl("al-al1", 300)).toBe(`${MEDIA_BASE}/nd/cover/al-al1?size=300`);
    expect(ndSourceProvider.coverUrl("al-al1")).toBe(`${MEDIA_BASE}/nd/cover/al-al1`);
  });

  describe("downloadToFile", () => {
    it("advertises the download capability", () => {
      expect(ndSourceProvider.capabilities.download).toBe(true);
    });

    it("passes the getSong suffix to nd_download and maps the result and progress", async () => {
      subsonicFetchMock.mockReturnValue(okAsync({ song: { id: "s1", title: "Come Together", suffix: "flac" } }));
      invokeMock.mockImplementation((_cmd, args) => {
        const { onProgress } = args as { onProgress: { onmessage?: (event: unknown) => void } };
        onProgress.onmessage?.({ type: "progress", data: { downloaded: 512, total: 1024 } });
        return Promise.resolve({ path: "C:/appdata/downloads-tmp/s1.flac", ext: "flac" });
      });
      const onProgress = vi.fn();

      const result = await ndSourceProvider.downloadToFile(ndTrackId("s1"), onProgress);

      expect(subsonicFetchMock).toHaveBeenCalledWith(configState.current, "getSong", { id: "s1" });
      expect(invokeMock).toHaveBeenCalledWith("nd_download", expect.objectContaining({ songId: "s1", suffix: "flac" }));
      expect(onProgress).toHaveBeenCalledWith({ type: "progress", data: { downloaded: 512, total: 1024 } });
      expect(result._unsafeUnwrap()).toEqual({
        path: "C:/appdata/downloads-tmp/s1.flac",
        format: { codec: "flac" },
      });
    });

    it("maps backend failures onto SourceError kinds", async () => {
      subsonicFetchMock.mockReturnValue(okAsync({ song: { id: "s1", title: "x" } }));

      invokeMock.mockRejectedValueOnce("upstream status 401");
      expect((await ndSourceProvider.downloadToFile(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("AUTH");

      invokeMock.mockRejectedValueOnce("request failed: connect timeout");
      expect((await ndSourceProvider.downloadToFile(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("NETWORK");

      invokeMock.mockRejectedValueOnce("cancelled");
      const cancelled = (await ndSourceProvider.downloadToFile(ndTrackId("s1")))._unsafeUnwrapErr();
      expect(cancelled).toEqual({ kind: "CANCELLED", message: "cancelled" });
    });

    it("rejects foreign ids and missing config before any request", async () => {
      expect((await ndSourceProvider.downloadToFile(TrackId("yt:x")))._unsafeUnwrapErr().kind).toBe("PARSE");

      configState.current = null;
      expect((await ndSourceProvider.downloadToFile(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("UNAVAILABLE");
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });

  describe("prefetch", () => {
    it("invokes nd_prefetch with the raw song id", async () => {
      invokeMock.mockResolvedValueOnce(undefined);

      const result = await ndSourceProvider.prefetch!(ndTrackId("s1"));

      expect(result.isOk()).toBe(true);
      expect(invokeMock).toHaveBeenCalledWith("nd_prefetch", { songId: "s1" });
    });

    it("maps backend failures onto SourceError kinds", async () => {
      invokeMock.mockRejectedValueOnce("prefetch failed: upstream status 401");
      expect((await ndSourceProvider.prefetch!(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("AUTH");

      invokeMock.mockRejectedValueOnce("prefetch skipped: track exceeds the cache cap");
      expect((await ndSourceProvider.prefetch!(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("UNKNOWN");
    });

    it("rejects foreign ids and missing config before any request", async () => {
      expect((await ndSourceProvider.prefetch!(TrackId("yt:x")))._unsafeUnwrapErr().kind).toBe("PARSE");

      configState.current = null;
      expect((await ndSourceProvider.prefetch!(ndTrackId("s1")))._unsafeUnwrapErr().kind).toBe("UNAVAILABLE");
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });
});
