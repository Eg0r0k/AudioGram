import { describe, expect, it, vi } from "vitest";
import { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

vi.mock("@/modules/sources", () => ({ sources: { get: () => ({}) } }));

import { sourceQueries } from "../source.queries";
import { latestTagQueryOptions, releaseNotesQueryOptions } from "@/modules/update/api/changelogApi";

describe("remote query options", () => {
  it("every source catalog query waits for the network", () => {
    const nd = sourceQueries("nd");
    const options = [
      nd.artists(true),
      nd.album(AlbumId("nd:a")),
      nd.artist(ArtistId("nd:ar")),
      nd.playlists(true),
      nd.playlist(PlaylistId("nd:p")),
      nd.playlistMeta(PlaylistId("nd:p")),
      nd.search("q", ["track"], 20),
    ];

    for (const option of options) {
      expect(option.networkMode, String(option.queryKey)).toBe("online");
    }
  });

  it("changelog queries wait for the network", () => {
    expect(releaseNotesQueryOptions("v1.0.0").networkMode).toBe("online");
    expect(latestTagQueryOptions("stable").networkMode).toBe("online");
  });
});
