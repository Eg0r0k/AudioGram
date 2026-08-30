import { beforeEach, describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { ytTrackId } from "@/types/track-ref";
import { TrackId } from "@/types/ids";
import { ytSourceProvider } from "../providers/yt.provider";
import { youtubeProvider } from "@/modules/youtube/provider";

vi.mock("@/modules/youtube/provider", () => ({
  youtubeProvider: {
    isAvailable: true,
    download: vi.fn(),
    cancelDownload: vi.fn(),
    resolve: vi.fn(),
    searchMusic: vi.fn(),
    continueMusic: vi.fn(),
    prefetch: vi.fn(),
  },
}));

describe("ytSourceProvider.downloadToFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the downloaded file path for a yt track id", async () => {
    vi.mocked(youtubeProvider.download).mockReturnValue(
      okAsync({ path: "C:/cache/abc.m4a" }),
    );

    const result = await ytSourceProvider.downloadToFile(ytTrackId("dQw4w9WgXcQ"));

    expect(result._unsafeUnwrap()).toEqual({ path: "C:/cache/abc.m4a" });
    expect(youtubeProvider.download).toHaveBeenCalledWith("dQw4w9WgXcQ", undefined);
  });

  it("maps a cancelled download onto the CANCELLED kind the manager expects", async () => {
    vi.mocked(youtubeProvider.download).mockReturnValue(
      errAsync({ kind: "CANCELLED", message: "download cancelled" }),
    );

    const result = await ytSourceProvider.downloadToFile(ytTrackId("dQw4w9WgXcQ"));

    // sources/types.ts contract: a cancelled downloadToFile fails with
    // kind "CANCELLED" — that is what manager.runJob matches on.
    expect(result._unsafeUnwrapErr().kind).toBe("CANCELLED");
  });

  it("rejects foreign ids before hitting the backend", async () => {
    const result = await ytSourceProvider.downloadToFile(TrackId("nd:s1"));
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(youtubeProvider.download).not.toHaveBeenCalled();
  });
});

describe("ytSourceProvider.prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warms the backend cache with the raw video id", async () => {
    vi.mocked(youtubeProvider.prefetch).mockReturnValue(okAsync(undefined));

    const result = await ytSourceProvider.prefetch!(ytTrackId("dQw4w9WgXcQ"));

    expect(result.isOk()).toBe(true);
    expect(youtubeProvider.prefetch).toHaveBeenCalledWith("dQw4w9WgXcQ");
  });

  it("maps backend errors onto the generic source error kinds", async () => {
    vi.mocked(youtubeProvider.prefetch).mockReturnValue(
      errAsync({ kind: "NETWORK", message: "googlevideo timed out" }),
    );

    const result = await ytSourceProvider.prefetch!(ytTrackId("dQw4w9WgXcQ"));

    expect(result._unsafeUnwrapErr().kind).toBe("NETWORK");
  });

  it("rejects foreign ids before hitting the backend", async () => {
    const result = await ytSourceProvider.prefetch!(TrackId("nd:s1"));
    expect(result._unsafeUnwrapErr().kind).toBe("PARSE");
    expect(youtubeProvider.prefetch).not.toHaveBeenCalled();
  });
});

describe("ytSourceProvider.searchPage", () => {
  const musicTrack = {
    kind: "track" as const,
    id: "v1",
    title: "Song",
    artists: [{ id: "UC1", name: "With a page" }, { id: null, name: "Plain credit" }],
    album: { id: "MPREb_1", name: "Album" },
    duration: 100,
    thumbnail: "https://i.ytimg.com/t.jpg",
    isVideo: false,
    trackNr: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("brands every kind of hit and carries the continuation", async () => {
    vi.mocked(youtubeProvider.searchMusic).mockReturnValue(okAsync({
      items: [
        musicTrack,
        { kind: "album", id: "MPREb_2", title: "An album", artists: [{ id: "UC2", name: "A" }], albumType: "album", year: 2020, thumbnail: null },
        { kind: "artist", id: "UC3", name: "An artist", thumbnail: null, subscriberCount: null },
        { kind: "playlist", id: "PL1", title: "A playlist", owner: null, trackCount: 12, thumbnail: null },
      ],
      continuation: "next-token",
      total: null,
      correctedQuery: null,
    }));

    const result = await ytSourceProvider.searchPage!("q", "all", null);
    const page = result._unsafeUnwrap();

    expect(youtubeProvider.searchMusic).toHaveBeenCalledWith("q", "all");
    expect(page.cursor).toBe("next-token");
    expect(page.items.map(hit => [hit.kind, hit.item.id])).toEqual([
      ["track", "yt:v1"],
      ["album", "yt:MPREb_2"],
      ["artist", "yt:UC3"],
      ["playlist", "yt:PL1"],
    ]);
  });

  it("keeps every artist credit in place, id or not", async () => {
    vi.mocked(youtubeProvider.searchMusic).mockReturnValue(okAsync({
      items: [musicTrack],
      continuation: null,
      total: null,
      correctedQuery: null,
    }));

    const result = await ytSourceProvider.searchPage!("q", "track", null);
    const [hit] = result._unsafeUnwrap().items;

    expect(hit.kind).toBe("track");
    // artistIds drops the credit without a page; artists must not.
    expect(hit.item).toMatchObject({
      artistIds: ["yt:UC1"],
      artists: [
        { id: "yt:UC1", name: "With a page" },
        { id: undefined, name: "Plain credit" },
      ],
    });
  });

  it("maps the generic scope onto the YouTube Music tab", async () => {
    vi.mocked(youtubeProvider.searchMusic).mockReturnValue(okAsync({
      items: [], continuation: null, total: null, correctedQuery: null,
    }));

    await ytSourceProvider.searchPage!("q", "playlist", null);

    expect(youtubeProvider.searchMusic).toHaveBeenCalledWith("q", "playlists");
  });

  it("continues from a cursor instead of searching again", async () => {
    vi.mocked(youtubeProvider.continueMusic).mockReturnValue(okAsync({
      items: [], continuation: null, total: null, correctedQuery: null,
    }));

    await ytSourceProvider.searchPage!("q", "album", "token");

    expect(youtubeProvider.continueMusic).toHaveBeenCalledWith("token", "albums");
    expect(youtubeProvider.searchMusic).not.toHaveBeenCalled();
  });
});
