import { describe, expect, it } from "vitest";
import { parseYoutubeCollectionUrl } from "../lib/url";

describe("parseYoutubeCollectionUrl", () => {
  it("recognizes playlist links in every common shape", () => {
    const expected = { kind: "playlist", id: "PLabc_123-XY" };

    expect(parseYoutubeCollectionUrl("https://www.youtube.com/playlist?list=PLabc_123-XY")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://music.youtube.com/playlist?list=PLabc_123-XY")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://m.youtube.com/playlist?list=PLabc_123-XY")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc_123-XY")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://youtu.be/dQw4w9WgXcQ?list=PLabc_123-XY")).toEqual(expected);
  });

  it("accepts links pasted without a scheme", () => {
    expect(parseYoutubeCollectionUrl("youtube.com/playlist?list=PLabc")).toEqual({ kind: "playlist", id: "PLabc" });
    expect(parseYoutubeCollectionUrl("  www.youtube.com/playlist?list=PLabc  ")).toEqual({ kind: "playlist", id: "PLabc" });
  });

  it("treats OLAK5uy_ album-playlists as playlists (the playlist page resolves them)", () => {
    expect(parseYoutubeCollectionUrl("https://music.youtube.com/playlist?list=OLAK5uy_kabc")).toEqual({
      kind: "playlist",
      id: "OLAK5uy_kabc",
    });
  });

  it("recognizes music album browse links and channel links", () => {
    expect(parseYoutubeCollectionUrl("https://music.youtube.com/browse/MPREb_abc123")).toEqual({
      kind: "album",
      id: "MPREb_abc123",
    });
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/channel/UCabc-123_xy")).toEqual({
      kind: "artist",
      id: "UCabc-123_xy",
    });
  });

  it("maps video links onto the video target", () => {
    const expected = { kind: "video", id: "dQw4w9WgXcQ" };

    expect(parseYoutubeCollectionUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual(expected);
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(expected);
  });

  it("falls back from unopenable lists to the link's video", () => {
    // The session-generated mix itself cannot be fetched anonymously.
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/watch?v=5da3D9ZfMQo&list=RD5da3D9ZfMQo&start_radio=1")).toEqual({
      kind: "video",
      id: "5da3D9ZfMQo",
    });
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=WL")).toEqual({
      kind: "video",
      id: "dQw4w9WgXcQ",
    });
  });

  it("rejects personal and auto-mix lists without a usable video", () => {
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/playlist?list=WL")).toBeNull();
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/playlist?list=LL")).toBeNull();
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/playlist?list=RDdQw4w9WgXcQ")).toBeNull();
  });

  it("rejects plain queries, malformed video ids and foreign hosts", () => {
    expect(parseYoutubeCollectionUrl("2h hiphop")).toBeNull();
    expect(parseYoutubeCollectionUrl("lofi playlist chill")).toBeNull();
    expect(parseYoutubeCollectionUrl("https://www.youtube.com/watch?v=tooShort")).toBeNull();
    expect(parseYoutubeCollectionUrl("https://vimeo.com/playlist?list=PLabc")).toBeNull();
    expect(parseYoutubeCollectionUrl("https://youtu.be/")).toBeNull();
    expect(parseYoutubeCollectionUrl("")).toBeNull();
  });
});
