import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";

//
// Real v9 → v10 upgrade against fake-indexeddb: seeds a database with the
// exact pre-multi-source schema, then opens the production AppDatabase over
// it and verifies the upgrade ran (pinned stamped, new tables, new indexes).
//

// The v9 stores spec verbatim from AppDatabase before the v10 migration.
const V9_STORES = {
  tracks: "&id, title, artistName, albumTitle, *artistIds, albumId, *tagIds, state, likedAt, addedAt, duration, playCount, storagePath, fingerprint, [title+likedAt], [addedAt+likedAt], [duration+likedAt], [artistName+likedAt], [albumTitle+likedAt], [playCount+likedAt]",
  artists: "&id, name, updatedAt",
  albums: "&id, title, artistId, year, updatedAt, [artistId+year], [title+artistId]",
  tags: "&id, &name",
  playlists: "&id, name, updatedAt, addedAt",
  folders: "&id, name, updatedAt, addedAt",
  listenEvents: "&id, trackId, artistId, albumId, startedAt",
  covers: "&id, ownerType, ownerId, [ownerType+ownerId], updatedAt",
  radioStations: "&id, name, isFavorite, addedAt, lastPlayedAt",
  audioFeatures: "&trackId, analyzedAt, algorithmVersion",
  trackChapters: "&trackId, updatedAt",
};

describe("v9 → v10 upgrade (integration)", () => {
  it("stamps pinned = 1 on existing rows, adds tables and the new indexes", async () => {
    const legacy = new Dexie("AudiogramDB");
    legacy.version(9).stores(V9_STORES);
    await legacy.open();

    await legacy.table("artists").add({ id: "ar1", name: "Artist", addedAt: 1, updatedAt: 1 });
    await legacy.table("albums").add({ id: "al1", title: "Album", artistId: "ar1", addedAt: 1, updatedAt: 1 });
    await legacy.table("tracks").add({
      id: "t1",
      title: "Song",
      artistIds: ["ar1"],
      albumId: "al1",
      tagIds: [],
      source: "local_internal",
      storagePath: "tracks/song.mp3",
      state: 0,
      duration: 100,
      format: {},
      playCount: 3,
      likedAt: 42,
      addedAt: 1,
    });
    legacy.close();

    // The production database class, opened over the seeded v9 data.
    const { db } = await import("@/db");
    await db.open();

    expect(db.verno).toBe(10);

    const track = await db.tracks.get("t1" as never);
    expect(track).toMatchObject({ id: "t1", pinned: 1, likedAt: 42, playCount: 3 });
    expect((await db.albums.get("al1" as never))?.pinned).toBe(1);
    expect((await db.artists.get("ar1" as never))?.pinned).toBe(1);

    // New tables exist and are empty.
    expect(await db.offlineCopies.count()).toBe(0);
    expect(await db.downloadJobs.count()).toBe(0);

    // New indexes are queryable.
    expect(await db.tracks.where("pinned").equals(1).count()).toBe(1);
    expect(await db.tracks.where("source").equals("local_internal").count()).toBe(1);

    db.close();
  });
});
