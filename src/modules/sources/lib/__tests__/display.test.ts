import { describe, expect, it, vi } from "vitest";
import { AlbumId, PlaylistId } from "@/types/ids";

// The registry stands in for real providers: every cover URL becomes a
// traceable "<kind>|<ref>|<size>" string, so a test can assert which source a
// bridge asked rather than what the resulting URL happens to look like.
vi.mock("../../registry", () => ({
  sources: {
    get: (kind: string) => ({
      coverUrl: (ref: string, size?: number) => `${kind}|${ref}|${size}`,
    }),
  },
}));

import { sourceAlbumToAlbumData, sourceCoverUrl, sourcePlaylistToPlaylistData } from "../display";
import { THUMB_SIZE_FULL } from "../cover-sizes";

describe("sourceCoverUrl", () => {
  it("routes to the provider of the given kind", () => {
    expect(sourceCoverUrl("nd", "cov", 100)).toBe("nd|cov|100");
    expect(sourceCoverUrl("yt", "cov", 100)).toBe("yt|cov|100");
  });

  it("yields an empty string for local tracks and for a missing ref", () => {
    expect(sourceCoverUrl("local", "cov", 100)).toBe("");
    expect(sourceCoverUrl("nd", undefined, 100)).toBe("");
  });
});

describe("sourcePlaylistToPlaylistData", () => {
  // The kind comes from the routed PlaylistId, not from dto.id: mapNdPlaylist
  // passes the raw server id through unbranded, unlike track/album/artist DTOs.
  it("derives the source from the playlist id instead of assuming Navidrome", () => {
    const vm = sourcePlaylistToPlaylistData(
      { id: "pl1", name: "Mix", coverRef: "cov", trackCount: 3 },
      PlaylistId("yt:pl1"),
    );

    expect(vm.image).toBe(`yt|cov|${THUMB_SIZE_FULL}`);
  });

  it("still resolves Navidrome playlists through the nd provider", () => {
    const vm = sourcePlaylistToPlaylistData(
      { id: "pl1", name: "Mix", coverRef: "cov", trackCount: 3 },
      PlaylistId("nd:pl1"),
    );

    expect(vm.image).toBe(`nd|cov|${THUMB_SIZE_FULL}`);
    expect(vm.isOwner).toBe(false);
  });
});

describe("sourceAlbumToAlbumData", () => {
  it("derives the source from the album id", () => {
    const vm = sourceAlbumToAlbumData({ id: AlbumId("yt:al1"), title: "Album", coverRef: "cov" });

    expect(vm.image).toBe(`yt|cov|${THUMB_SIZE_FULL}`);
  });
});
