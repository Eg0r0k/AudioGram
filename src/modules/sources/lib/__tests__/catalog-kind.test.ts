import { describe, expect, it, vi } from "vitest";
import type { SourceEntityCaps } from "../../types";

const caps = vi.hoisted(() => ({
  nd: { artists: { list: true, open: true }, albums: { list: true, open: true }, playlists: { list: true, open: true } },
  yt: { artists: { list: false, open: false }, albums: { list: false, open: false }, playlists: { list: false, open: false } },
} as Record<string, Record<string, SourceEntityCaps>>));

const paging = vi.hoisted(() => ({ yt: true, nd: false } as Record<string, boolean>));

vi.mock("../../registry", () => ({
  sources: {
    get: (kind: string) => ({
      capabilities: caps[kind],
      getPlaylistPage: paging[kind] ? () => undefined : undefined,
    }),
  },
}));

import { pagedPlaylistKindOf, remoteCatalogKindOf, remoteListKindOf } from "../catalog-kind";

describe("remoteCatalogKindOf", () => {
  it("returns null for local ids without consulting a provider", () => {
    expect(remoteCatalogKindOf("track-123", "albums")).toBeNull();
  });

  it("returns the kind when the source can open that entity by id", () => {
    expect(remoteCatalogKindOf("nd:al1", "albums")).toBe("nd");
    expect(remoteCatalogKindOf("nd:ar1", "artists")).toBe("nd");
    expect(remoteCatalogKindOf("nd:pl1", "playlists")).toBe("nd");
  });

  it("falls back to local when the source cannot open that entity", () => {
    expect(remoteCatalogKindOf("yt:al1", "albums")).toBeNull();
  });

  // "list" and "open" are independent: a source can serve one collection by id
  // without being able to enumerate the catalog it belongs to.
  it("asks about opening, not about listing", () => {
    caps.yt.albums = { list: false, open: true };

    expect(remoteCatalogKindOf("yt:al1", "albums")).toBe("yt");
  });
});

describe("remoteListKindOf", () => {
  it("returns null for local ids", () => {
    expect(remoteListKindOf("playlist-123", "playlists")).toBeNull();
  });

  it("returns the kind only when the source can enumerate the collection", () => {
    caps.yt.playlists = { list: false, open: true };

    expect(remoteListKindOf("nd:pl1", "playlists")).toBe("nd");
    expect(remoteListKindOf("yt:pl1", "playlists")).toBeNull();
  });
});

describe("pagedPlaylistKindOf", () => {
  it("returns null for a local id", () => {
    expect(pagedPlaylistKindOf("playlist-123")).toBeNull();
  });

  // The presence of getPlaylistPage is the whole contract — a source opts
  // into lazy paging by implementing it, and nothing names a source here.
  it("returns the kind only when the provider pages its playlists", () => {
    caps.yt.playlists = { list: false, open: true };

    expect(pagedPlaylistKindOf("yt:pl1")).toBe("yt");
    expect(pagedPlaylistKindOf("nd:pl1")).toBeNull();
  });

  it("returns null when the source cannot open the playlist at all", () => {
    caps.yt.playlists = { list: false, open: false };

    expect(pagedPlaylistKindOf("yt:pl1")).toBeNull();
  });
});
