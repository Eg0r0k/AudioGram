import { describe, it, expect } from "vitest";
import { ndAlbumId, ndArtistId, ndTrackId, parseTrackRef, ytTrackId } from "../track-ref";
import { TrackId } from "../ids";

describe("parseTrackRef", () => {
  it("treats unprefixed ids as local", () => {
    expect(parseTrackRef(TrackId("3f2b8a1c-7d4e-4a09-9c1e-5b6d2f8e0a17"))).toEqual({ kind: "local" });
  });

  it("parses nd ids into songId", () => {
    expect(parseTrackRef(TrackId("nd:abc123"))).toEqual({ kind: "nd", songId: "abc123" });
  });

  it("parses yt ids into videoId", () => {
    expect(parseTrackRef(TrackId("yt:dQw4w9WgXcQ"))).toEqual({ kind: "yt", videoId: "dQw4w9WgXcQ" });
  });

  it("requires the colon — a bare prefix-looking id stays local", () => {
    expect(parseTrackRef(TrackId("ndabc"))).toEqual({ kind: "local" });
    expect(parseTrackRef(TrackId("ytabc"))).toEqual({ kind: "local" });
  });

  it("only matches the prefix at the start", () => {
    expect(parseTrackRef(TrackId("and:xyz"))).toEqual({ kind: "local" });
  });
});

describe("id factories", () => {
  it("round-trip through parseTrackRef", () => {
    expect(parseTrackRef(ndTrackId("s1"))).toEqual({ kind: "nd", songId: "s1" });
    expect(parseTrackRef(ytTrackId("v1"))).toEqual({ kind: "yt", videoId: "v1" });
  });

  it("prefix album and artist ids in their own brand spaces", () => {
    expect(ndAlbumId("al1")).toBe("nd:al1");
    expect(ndArtistId("ar1")).toBe("nd:ar1");
  });

  it("keeps colons inside the remote id intact", () => {
    expect(parseTrackRef(ndTrackId("a:b:c"))).toEqual({ kind: "nd", songId: "a:b:c" });
  });
});
