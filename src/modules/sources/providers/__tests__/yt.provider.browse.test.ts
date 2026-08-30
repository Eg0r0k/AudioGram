import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { ytAlbumId, ytArtistId, ytPlaylistId } from "@/types/track-ref";
import { AlbumId, PlaylistId } from "@/types/ids";
import { youtubeProvider } from "@/modules/youtube/provider";
import { ytSourceProvider } from "../yt.provider";

vi.mock("@/modules/youtube/provider", () => ({
  youtubeProvider: {
    isAvailable: true,
    album: vi.fn(),
    artist: vi.fn(),
    playlist: vi.fn(),
    continueMusic: vi.fn(),
  },
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));
vi.mock("@/modules/youtube/lib/thumbnail", async (importOriginal) => ({
  ...await importOriginal<object>(),
  proxiedThumbnail: (url: string) => url,
}));

const track = (id: string, title: string) => ({
  id,
  title,
  artists: [{ id: "UC1", name: "Artist" }],
  album: null,
  duration: 100,
  thumbnail: "https://i.ytimg.com/a.jpg",
  isVideo: false,
  trackNr: null,
});

const page = (ids: string[], continuation: string | null) => ({
  items: ids.map(id => ({ kind: "track" as const, ...track(id, id) })),
  continuation,
  total: null,
  correctedQuery: null,
});

describe("ytSourceProvider browsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an id from another source before calling the backend", async () => {
    const result = await ytSourceProvider.getAlbum(AlbumId("nd:al1"));

    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(youtubeProvider.album).not.toHaveBeenCalled();
  });

  it("maps an album onto branded ids and normalized track DTOs", async () => {
    vi.mocked(youtubeProvider.album).mockReturnValue(okAsync({
      id: "MPREb_x",
      playlistId: null,
      title: "Abbey Road",
      artists: [{ id: "UC1", name: "The Beatles" }],
      albumType: "ALBUM",
      year: 1969,
      thumbnail: "https://i.ytimg.com/al.jpg",
      trackCount: 1,
      tracks: [track("v1", "Come Together")],
    }));

    const { album, tracks } = (await ytSourceProvider.getAlbum(ytAlbumId("MPREb_x")))._unsafeUnwrap();

    expect(youtubeProvider.album).toHaveBeenCalledWith("MPREb_x");
    expect(album).toMatchObject({
      id: "yt:MPREb_x",
      title: "Abbey Road",
      artistId: "yt:UC1",
      artistName: "The Beatles",
      year: 1969,
      trackCount: 1,
    });
    expect(tracks[0]).toMatchObject({ id: "yt:v1", albumId: "yt:MPREb_x" });
  });

  // The generic ArtistPage renders top tracks as a plain track list, the way
  // it already does for Navidrome — the provider has to fill `tracks` for it.
  it("carries the artist's top tracks alongside the albums", async () => {
    vi.mocked(youtubeProvider.artist).mockReturnValue(okAsync({
      id: "UC1",
      name: "The Beatles",
      thumbnail: "https://i.ytimg.com/ar.jpg",
      subscriberCount: 100,
      topTracks: [track("v1", "Come Together")],
      albums: [{
        id: "MPREb_x",
        title: "Abbey Road",
        artists: [{ id: "UC1", name: "The Beatles" }],
        albumType: "ALBUM",
        year: 1969,
        thumbnail: null,
      }],
      playlists: [],
    }));

    const result = (await ytSourceProvider.getArtist(ytArtistId("UC1")))._unsafeUnwrap();

    expect(result.artist).toMatchObject({ id: "yt:UC1", name: "The Beatles", albumCount: 1 });
    expect(result.albums[0]).toMatchObject({ id: "yt:MPREb_x", artistId: "yt:UC1" });
    expect(result.tracks?.map(t => t.id)).toEqual(["yt:v1"]);
  });

  describe("getPlaylistPage", () => {
    it("returns the metadata with the first page and a cursor for the next", async () => {
      vi.mocked(youtubeProvider.playlist).mockReturnValue(okAsync({
        id: "PL1",
        title: "Road trip",
        owner: "someone",
        description: null,
        trackCount: 40,
        thumbnail: "https://i.ytimg.com/pl.jpg",
        fromYtm: true,
        tracks: page(["v1", "v2"], "CURSOR_A"),
      }));

      const result = (await ytSourceProvider.getPlaylistPage!(ytPlaylistId("PL1"), null))._unsafeUnwrap();

      expect(result.playlist).toMatchObject({ id: "yt:PL1", name: "Road trip" });
      expect(result.page.items.map(t => t.id)).toEqual(["yt:v1", "yt:v2"]);
      expect(result.page.cursor).toBe("CURSOR_A");
    });

    it("returns no metadata on a continuation page — it has not changed", async () => {
      vi.mocked(youtubeProvider.continueMusic).mockReturnValue(okAsync(page(["v3"], null)));

      const result = (await ytSourceProvider.getPlaylistPage!(ytPlaylistId("PL1"), "CURSOR_A"))._unsafeUnwrap();

      expect(youtubeProvider.continueMusic).toHaveBeenCalledWith("CURSOR_A", "tracks");
      expect(youtubeProvider.playlist).not.toHaveBeenCalled();
      expect(result.playlist).toBeNull();
      expect(result.page).toEqual({ items: [expect.objectContaining({ id: "yt:v3" })], cursor: null });
    });
  });

  describe("getPlaylist", () => {
    // Its callers are queue-all and download-all: a first page that looks
    // complete would silently drop the rest of the playlist.
    it("follows continuations until the playlist is exhausted", async () => {
      vi.mocked(youtubeProvider.playlist).mockReturnValue(okAsync({
        id: "PL1",
        title: "Road trip",
        owner: null,
        description: null,
        trackCount: 40,
        thumbnail: null,
        fromYtm: true,
        tracks: page(["v1"], "CURSOR_A"),
      }));
      vi.mocked(youtubeProvider.continueMusic)
        .mockReturnValueOnce(okAsync(page(["v2"], "CURSOR_B")))
        .mockReturnValueOnce(okAsync(page(["v3"], null)));

      const result = (await ytSourceProvider.getPlaylist(ytPlaylistId("PL1")))._unsafeUnwrap();

      expect(result.tracks.map(t => t.id)).toEqual(["yt:v1", "yt:v2", "yt:v3"]);
      expect(youtubeProvider.continueMusic).toHaveBeenCalledTimes(2);
    });

    // The estimate YouTube reports is not the number of tracks handed over.
    it("reports the count it actually walked, not the server's estimate", async () => {
      vi.mocked(youtubeProvider.playlist).mockReturnValue(okAsync({
        id: "PL1",
        title: "Road trip",
        owner: null,
        description: null,
        trackCount: 999,
        thumbnail: null,
        fromYtm: true,
        tracks: page(["v1", "v2"], null),
      }));

      const result = (await ytSourceProvider.getPlaylist(ytPlaylistId("PL1")))._unsafeUnwrap();

      expect(result.playlist.trackCount).toBe(2);
    });

    it("rejects an id from another source", async () => {
      const result = await ytSourceProvider.getPlaylist(PlaylistId("nd:pl1"));

      expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    });
  });
});
