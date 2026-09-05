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

    await cleanupAfterTrackRemoval([{ id: "t1" as TrackId, albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeUndefined();
    expect(await db.artists.get("ar1")).toBeUndefined();
    expect(await db.covers.count()).toBe(0);
  });

  it("drops a track-owned cover with its track", async () => {
    await db.covers.put({
      id: "c2", ownerType: "track", ownerId: "t1", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });

    await cleanupAfterTrackRemoval([{ id: "t1" as TrackId, albumId: "" as AlbumId, artistIds: [] }]);

    expect(await db.covers.count()).toBe(0);
  });

  it("keeps the album while other tracks still reference it", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.tracks.put(trackRow("t2", "al1", ["ar1"]));

    await cleanupAfterTrackRemoval([{ id: "t1" as TrackId, albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeDefined();
    expect(await db.artists.get("ar1")).toBeDefined();
  });

  it("keeps the artist while another of their albums survives", async () => {
    await db.artists.put(artistRow("ar1"));
    await db.albums.put(albumRow("al1", "ar1"));
    await db.albums.put(albumRow("al2", "ar1", "Other"));
    await db.tracks.put(trackRow("t2", "al2", ["ar1"]));

    await cleanupAfterTrackRemoval([{ id: "t1" as TrackId, albumId: "al1" as AlbumId, artistIds: ["ar1" as ArtistId] }]);

    expect(await db.albums.get("al1")).toBeUndefined();
    expect(await db.albums.get("al2")).toBeDefined();
    expect(await db.artists.get("ar1")).toBeDefined();
  });

  it("sweep drops track-owned covers whose track no longer exists", async () => {
    await db.tracks.put(trackRow("t-alive", "", []));
    await db.covers.put({
      id: "c-alive", ownerType: "track", ownerId: "t-alive", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });
    await db.covers.put({
      id: "c-orphan", ownerType: "track", ownerId: "t-gone", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    });

    await sweepOrphanedEntities();

    expect(await db.covers.get("c-alive")).toBeDefined();
    expect(await db.covers.get("c-orphan")).toBeUndefined();
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

  it("large batch: removes exactly the albums, covers and artists that lost everything", async () => {
    const ALBUMS = 100;
    const ARTISTS = 50;
    await db.artists.bulkPut(Array.from({ length: ARTISTS }, (_, i) => artistRow(`ar${i}`)));
    await db.albums.bulkPut(Array.from({ length: ALBUMS }, (_, i) => albumRow(`al${i}`, `ar${i % ARTISTS}`, `Album ${i}`)));
    await db.covers.bulkPut(Array.from({ length: ALBUMS }, (_, i) => ({
      id: `c${i}`, ownerType: "album", ownerId: `al${i}`, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
    })));
    const tracks = Array.from({ length: ALBUMS * 3 }, (_, i) => trackRow(`t${i}`, `al${i % ALBUMS}`, [`ar${(i % ALBUMS) % ARTISTS}`]));
    await db.tracks.bulkPut(tracks);

    // Every track of every even album goes; odd albums keep all three.
    const removed = tracks.filter(track => Number(track.albumId.slice(2)) % 2 === 0);
    await db.tracks.bulkDelete(removed.map(track => track.id));
    await cleanupAfterTrackRemoval(removed.map(track => ({ id: track.id, albumId: track.albumId, artistIds: track.artistIds })));

    const albumsLeft = (await db.albums.toArray()).map(album => album.id).sort();
    const artistsLeft = (await db.artists.toArray()).map(artist => artist.id).sort();
    const coversLeft = (await db.covers.toArray()).map(cover => cover.ownerId).sort();
    const expectedAlbums = Array.from({ length: ALBUMS }, (_, i) => `al${i}`).filter((_, i) => i % 2 === 1).sort();
    // Artist k owns albums k and k+50, which share parity: even artists lose both.
    const expectedArtists = Array.from({ length: ARTISTS }, (_, i) => `ar${i}`).filter((_, i) => i % 2 === 1).sort();

    expect(albumsLeft).toEqual(expectedAlbums);
    expect(artistsLeft).toEqual(expectedArtists);
    expect(coversLeft).toEqual(expectedAlbums);
  });

  it("keeps an artist whose only remaining link is a co-credited track", async () => {
    await db.artists.put(artistRow("solo"));
    await db.artists.put(artistRow("feat"));
    await db.albums.put(albumRow("al1", "solo"));
    await db.tracks.put(trackRow("t-keep", "al1", ["solo", "feat"]));

    await cleanupAfterTrackRemoval([{ id: "t-gone" as TrackId, albumId: "al1" as AlbumId, artistIds: ["feat" as ArtistId] }]);

    expect(await db.artists.get("feat")).toBeDefined();
    expect(await db.artists.get("solo")).toBeDefined();
    expect(await db.albums.get("al1")).toBeDefined();
  });

  it("sweep on a mixed library keeps every referenced entity and counts only orphans", async () => {
    await db.artists.bulkPut(["ar-tracks", "ar-album-only", "ar-orphan", "ar-feat"].map(artistRow));
    await db.albums.put(albumRow("al-full", "ar-tracks"));
    await db.albums.put(albumRow("al-foreign", "ar-album-only", "Foreign"));
    await db.albums.put(albumRow("al-empty", "ar-orphan", "Empty"));
    await db.tracks.put(trackRow("t1", "al-full", ["ar-tracks", "ar-feat"]));
    await db.tracks.put(trackRow("t2", "al-foreign", ["ar-tracks"]));
    await db.covers.bulkPut([
      { id: "c-empty", ownerType: "album", ownerId: "al-empty", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1 },
      { id: "c-full", ownerType: "album", ownerId: "al-full", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1 },
    ]);

    const result = await sweepOrphanedEntities();

    expect(result).toEqual({ albums: 1, artists: 1 });
    expect((await db.albums.toArray()).map(album => album.id).sort()).toEqual(["al-foreign", "al-full"]);
    expect((await db.artists.toArray()).map(artist => artist.id).sort()).toEqual(["ar-album-only", "ar-feat", "ar-tracks"]);
    expect((await db.covers.toArray()).map(cover => cover.id)).toEqual(["c-full"]);
  });
});
