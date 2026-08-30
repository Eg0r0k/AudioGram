import { describe, expect, it, vi } from "vitest";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

vi.mock("@/modules/sources/lib/display", () => ({
  sourceCoverUrl: (kind: string, coverRef: string | undefined) =>
    (coverRef ? `cover:${kind}:${coverRef}` : ""),
}));

import {
  albumResultItem,
  artistResultItem,
  hitResultItem,
  playlistResultItem,
  searchResultRoute,
  trackArtistRoutes,
} from "../lib/resultItems";

const t = (key: string, plural: number) => `${key}:${plural}`;

describe("search result items", () => {
  it("says artist and year on an album row, and neither when unknown", () => {
    expect(albumResultItem(
      { id: AlbumId("yt:a1"), title: "Album", artistName: "Someone", year: 2020, coverRef: "c" },
      "yt",
    )).toMatchObject({ type: "album", artist: "Someone · 2020", coverPath: "cover:yt:c" });

    expect(albumResultItem({ id: AlbumId("yt:a2"), title: "Bare" }, "yt").artist).toBeUndefined();
  });

  it("leaves an artist row without a subtitle", () => {
    const item = artistResultItem({ id: ArtistId("nd:x"), name: "Someone" }, "nd");

    expect(item).toMatchObject({ type: "artist", title: "Someone" });
    expect(item.artist).toBeUndefined();
  });

  it("counts a playlist's tracks only when the source said how many", () => {
    expect(playlistResultItem(
      { id: PlaylistId("yt:p1"), name: "Mix", trackCount: 12 }, "yt", t,
    ).artist).toBe("common.trackCount:12");

    expect(playlistResultItem(
      { id: PlaylistId("yt:p2"), name: "Unknown", trackCount: 0 }, "yt", t,
    ).artist).toBeUndefined();
  });

  it("routes a result to the source's view of the entity", () => {
    const item = hitResultItem(
      { kind: "album", item: { id: AlbumId("yt:a1"), title: "Album" } }, "yt", t,
    );

    expect(searchResultRoute(item, { catalog: true })).toMatchObject({
      params: { id: "yt:a1" },
      query: { catalog: "1" },
    });
    // Without the intent the same id names the library row.
    expect(searchResultRoute(item)).not.toHaveProperty("query");
  });

  it("does not route a track — picking one plays it", () => {
    const item = hitResultItem(
      { kind: "track", item: { id: TrackId("yt:v1"), title: "Song" } }, "yt", t,
    );

    expect(searchResultRoute(item, { catalog: true })).toBeNull();
  });

  it("keeps a credit without a page in its own position", () => {
    const dto: SourceTrackDTO = {
      id: TrackId("yt:v1"),
      title: "Song",
      artistIds: [ArtistId("yt:UC1")],
      artists: [
        { id: ArtistId("yt:UC1"), name: "With a page" },
        { name: "Plain credit" },
      ],
    };

    const routes = trackArtistRoutes(dto, { catalog: true });

    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({ params: { id: "yt:UC1" } });
    expect(routes[1]).toBeNull();
  });
});
