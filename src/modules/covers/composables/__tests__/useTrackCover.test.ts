import { describe, expect, it } from "vitest";
import { trackCoverOwner } from "../useTrackCover";
import { AlbumId, TrackId } from "@/types/ids";

describe("trackCoverOwner", () => {
  it("points at the album when the track belongs to one", () => {
    expect(trackCoverOwner({ id: TrackId("t1"), albumId: AlbumId("al1") }))
      .toEqual({ ownerType: "album", ownerId: "al1" });
  });

  it("falls back to the track's own cover when it has no album", () => {
    expect(trackCoverOwner({ id: TrackId("t1"), albumId: AlbumId("") }))
      .toEqual({ ownerType: "track", ownerId: "t1" });
  });

  it("resolves to nothing without a track", () => {
    expect(trackCoverOwner(null)).toBeNull();
    expect(trackCoverOwner(undefined)).toBeNull();
  });
});
