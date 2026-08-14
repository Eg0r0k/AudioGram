import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { cleanupAfterTrackRemoval, sweepOrphanedEntities } from "../library-gc";

function artistRow(id: string) {
  return { id: id as ArtistId, name: id, pinned: 1, addedAt: 1, updatedAt: 1 };
}

function albumRow(id: string, artistId: string, title = "Album") {
  return { id: id as AlbumId, title, artistId: artistId as ArtistId, pinned: 1, addedAt: 1, updatedAt: 1 };
}

function trackRow(id: string, albumId: string, artistIds: string[]) {
  return {
    id: id as TrackId,
    title: id,
    artistName: "A",
    albumTitle: "Album",
    artistIds: artistIds as ArtistId[],
    albumId: albumId as AlbumId,
    tagIds: [],
    source: "local_internal",
    pinned: 1,
    state: "ready",
    storagePath: `tracks/${id}.mp3`,
    duration: 100,
    format: {},
    playCount: 0,
    addedAt: 1,
  };
}

describe("library-gc", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("removes the album and artist once their last track is gone", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.covers.put({
      id: "c1", ownerType: "album", ownerId: "al1", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });

    await cleanupAfterTrackRemoval([{ albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeUndefined();
    expect(await db.artists.get("ar1")).toBeUndefined();
    expect(await db.covers.count()).toBe(0);
  });

  it("keeps the album while other tracks still reference it", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.tracks.put(trackRow("t2", "al1", ["ar1"]));

    await cleanupAfterTrackRemoval([{ albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeDefined();
    expect(await db.artists.get("ar1")).toBeDefined();
  });

  it("keeps the artist while another of their albums survives", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.albums.put(albumRow("al2", "ar1", "Other"));
    await db.tracks.put(trackRow("t2", "al2", ["ar1"]));

    await cleanupAfterTrackRemoval([{ albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeUndefined();
    expect(await db.albums.get("al2")).toBeDefined();
    expect(await db.artists.get("ar1")).toBeDefined();
  });

  it("sweep clears accumulated orphans across the whole library", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.artists.put(artistRow("ar2"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.albums.put(albumRow("al2", "ar2", "Live"));
    await db.tracks.put(trackRow("t1", "al2", ["ar2"]));

    const result = await sweepOrphanedEntities();

    expect(result).toEqual({ albums: 1, artists: 1 });
    expect(await db.albums.get("al1")).toBeUndefined();
    expect(await db.artists.get("ar1")).toBeUndefined();
    expect(await db.albums.get("al2")).toBeDefined();
    expect(await db.artists.get("ar2")).toBeDefined();
  });
});
