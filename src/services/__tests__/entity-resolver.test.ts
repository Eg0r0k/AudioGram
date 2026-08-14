import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import type { AlbumId, ArtistId } from "@/types/ids";
import type { BaseMetadata } from "@/workers/types";
import { EntityResolver } from "../entity-resolver";

function meta(artists: string[], album: string): BaseMetadata {
  return { title: "T", artists, album, duration: 100, format: {} } as BaseMetadata;
}

describe("EntityResolver identity normalization", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("treats whitespace-padded artist names as one artist", async () => {
    const resolver = new EntityResolver();
    await resolver.resolve([meta(["Artist "], "Album"), meta(["Artist"], "Album")]);

    const padded = resolver.getArtistId("Artist ");
    const clean = resolver.getArtistId("Artist");
    expect(padded).toBeDefined();
    expect(padded).toBe(clean);
  });

  it("keys new albums so a padded lookup still hits the entry", async () => {
    const resolver = new EntityResolver();
    await resolver.resolve([meta(["Artist"], " Album ")]);

    const artistId = resolver.getArtistId("Artist")!;
    const padded = resolver.getAlbumEntry(artistId, " Album ");
    const clean = resolver.getAlbumEntry(artistId, "Album");
    expect(padded).toBeDefined();
    expect(padded).toBe(clean);
  });

  it("matches an existing DB album whose stored title carries whitespace", async () => {
    await db.artists.put({ id: "ar1" as ArtistId, name: "Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.albums.put({
      id: "al1" as AlbumId, title: "Album ", artistId: "ar1" as ArtistId, pinned: 1, addedAt: 1, updatedAt: 1,
    });

    const resolver = new EntityResolver();
    await resolver.resolve([meta(["Artist"], "Album")]);

    const entry = resolver.getAlbumEntry("ar1" as ArtistId, "Album");
    expect(entry).toMatchObject({ id: "al1", isNew: false });
  });
});
