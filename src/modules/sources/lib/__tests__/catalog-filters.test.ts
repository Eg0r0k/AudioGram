import { describe, expect, it, vi } from "vitest";
import type { SourceEntityCaps } from "../../types";

const caps = vi.hoisted(() => ({
  current: {} as Record<string, SourceEntityCaps>,
}));

vi.mock("../../registry", () => ({
  sources: { get: () => ({ capabilities: caps.current }) },
}));

import { catalogFilters } from "../catalog-filters";

const listing = (...entities: string[]): Record<string, SourceEntityCaps> =>
  Object.fromEntries(["artists", "albums", "playlists"].map(entity =>
    [entity, { list: entities.includes(entity), open: true }]));

describe("catalogFilters", () => {
  it("offers no tabs for the local library", () => {
    expect(catalogFilters(null)).toEqual([]);
  });

  // Navidrome lists all three — the tab strip must stay exactly as it was
  // before the filters started asking about capabilities.
  it("offers every tab to a source that lists all three collections", () => {
    caps.current = listing("artists", "albums", "playlists");

    expect(catalogFilters("nd")).toEqual(["all", "playlist", "artist", "album"]);
  });

  it("drops the tabs a source cannot fill", () => {
    caps.current = listing("playlists");

    expect(catalogFilters("nd")).toEqual(["all", "playlist"]);
  });

  // "all" over nothing is a permanently empty list, not a usable tab.
  it("offers nothing at all when the source lists no collection", () => {
    caps.current = listing();

    expect(catalogFilters("yt")).toEqual([]);
  });
});
