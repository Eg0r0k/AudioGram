/**
 * Query-count-sensitive benchmark for the orphan cascade and the startup
 * sweep. Seeding happens in the per-iteration `setup` hook, so the timed
 * body is the GC call alone. fake-indexeddb is in-memory, so absolute
 * numbers are not the app's; the point is that the cost no longer grows
 * with the number of candidate albums and artists. Run with:
 *
 *   pnpm test:bench -- library-gc
 */
import "fake-indexeddb/auto";
import { bench, describe, vi } from "vitest";
import { db } from "@/db";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { cleanupAfterTrackRemoval, sweepOrphanedEntities, type RemovedTrackRef } from "../library-gc";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const TRACKS = 1010;
const ALBUMS = 200;
const ARTISTS = 100;

const artistId = (i: number) => `ar-${i}` as ArtistId;
const albumId = (i: number) => `al-${i}` as AlbumId;

interface SeedTrack {
  id: TrackId;
  albumId: AlbumId;
  artistIds: ArtistId[];
}

const seed = async (withOrphans: boolean): Promise<SeedTrack[]> => {
  await Promise.all(db.tables.map(table => table.clear()));
  const artists = Array.from({ length: ARTISTS }, (_, i) => ({ id: artistId(i), name: `Artist ${i}`, pinned: 1, addedAt: 1, updatedAt: 1 }));
  const albums = Array.from({ length: ALBUMS }, (_, i) => ({ id: albumId(i), title: `Album ${i}`, artistId: artistId(i % ARTISTS), pinned: 1, addedAt: 1, updatedAt: 1 }));
  const tracks = Array.from({ length: TRACKS }, (_, i) => ({
    id: `t-${i}` as TrackId,
    title: `Track ${i}`,
    artistName: "A",
    albumTitle: "Album",
    artistIds: [artistId(i % ARTISTS)],
    albumId: albumId(i % ALBUMS),
    tagIds: [],
    source: "local_internal",
    pinned: 1,
    state: 0,
    storagePath: `tracks/t-${i}.mp3`,
    duration: 100,
    format: {},
    playCount: 0,
    addedAt: 1,
  }));
  const covers = albums.map(album => ({
    id: `c-${album.id}`, ownerType: "album", ownerId: album.id, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1,
  }));
  if (withOrphans) {
    for (let i = 0; i < ARTISTS; i++) artists.push({ id: `empty-ar-${i}` as ArtistId, name: `Empty ${i}`, pinned: 1, addedAt: 1, updatedAt: 1 });
    for (let i = 0; i < ALBUMS; i++) albums.push({ id: `empty-al-${i}` as AlbumId, title: `Empty ${i}`, artistId: `empty-ar-${i % ARTISTS}` as ArtistId, pinned: 1, addedAt: 1, updatedAt: 1 });
    for (let i = 0; i < ALBUMS; i++) covers.push({ id: `oc-${i}`, ownerType: "track", ownerId: `gone-${i}`, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1 });
  }
  await db.artists.bulkPut(artists as never[]);
  await db.albums.bulkPut(albums as never[]);
  await db.tracks.bulkPut(tracks as never[]);
  await db.covers.bulkPut(covers as never[]);
  return tracks.map(track => ({ id: track.id, albumId: track.albumId, artistIds: track.artistIds }));
};

const refsOf = (tracks: SeedTrack[]): RemovedTrackRef[] => tracks;

let removed: RemovedTrackRef[] = [];

const prepareRemoval = (keepEvery: number) => async () => {
  const tracks = await seed(false);
  const gone = keepEvery === 1 ? tracks : tracks.filter((_, i) => i % keepEvery === 0);
  await db.tracks.bulkDelete(gone.map(track => track.id));
  removed = refsOf(gone);
};

describe("library-gc", () => {
  bench("cascade after deleting every track", async () => {
    await cleanupAfterTrackRemoval(removed);
  }, { iterations: 5, warmupIterations: 1, setup: prepareRemoval(1) });

  bench("cascade after deleting half the tracks", async () => {
    await cleanupAfterTrackRemoval(removed);
  }, { iterations: 5, warmupIterations: 1, setup: prepareRemoval(2) });

  bench("startup sweep over a library with orphans", async () => {
    await sweepOrphanedEntities();
  }, { iterations: 5, warmupIterations: 1, setup: async () => { await seed(true); } });
});
