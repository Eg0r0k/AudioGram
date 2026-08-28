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
    // Chapters that leaked under the empty ephemeral-track key — the v11
    // cleanup must drop this row and keep real ones.
    await legacy.table("trackChapters").add({ trackId: "", chapters: [{ time: 1770 }], updatedAt: 1 });
    await legacy.table("trackChapters").add({ trackId: "t1", chapters: [{ time: 10 }], updatedAt: 1 });
    // A track whose denormalized names were cleared to undefined by an old
    // cascade — v12 must backfill "" so it stays visible in indexed sorts.
    await legacy.table("tracks").add({
      id: "t2",
      title: "Detached",
      artistIds: [],
      albumId: "",
      tagIds: [],
      source: "local_internal",
      storagePath: "tracks/detached.mp3",
      state: 0,
      duration: 50,
      format: {},
      playCount: 0,
      likedAt: 43,
      addedAt: 2,
    });
    // Duplicate covers for one owner — v12 keeps the newest so the unique
    // [ownerType+ownerId] index of v13 can be created.
    await legacy.table("covers").add({ id: "c-old", ownerType: "album", ownerId: "al1", blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1 });
    await legacy.table("covers").add({ id: "c-new", ownerType: "album", ownerId: "al1", blob: new Blob(), mimeType: "image/webp", addedAt: 2, updatedAt: 2 });
    await legacy.table("covers").add({ id: "c-other", ownerType: "artist", ownerId: "ar1", blob: new Blob(), mimeType: "image/webp", addedAt: 3, updatedAt: 3 });
    legacy.close();

    // The production database class, opened over the seeded v9 data.
    const { db } = await import("@/db");
    await db.open();

    expect(db.verno).toBe(13);

    const track = await db.tracks.get("t1" as never);
    expect(track).toMatchObject({ id: "t1", pinned: 1, likedAt: 42, playCount: 3 });
    expect((await db.albums.get("al1" as never))?.pinned).toBe(1);
    expect((await db.artists.get("ar1" as never))?.pinned).toBe(1);

    // New tables exist and are empty.
    expect(await db.offlineCopies.count()).toBe(0);
    expect(await db.downloadJobs.count()).toBe(0);

    // v11 removed the empty-key chapters row and left the real one.
    expect(await db.trackChapters.get("" as never)).toBeUndefined();
    expect(await db.trackChapters.get("t1" as never)).toMatchObject({ trackId: "t1" });

    // New indexes are queryable.
    expect(await db.tracks.where("pinned").equals(1).count()).toBe(2);

    // v12: names backfilled to "" so the row is in the artistName/albumTitle
    // indexes and in the liked compound index.
    const detached = await db.tracks.get("t2" as never);
    expect(detached).toMatchObject({ artistName: "", albumTitle: "" });
    expect((await db.tracks.orderBy("artistName").primaryKeys())).toContain("t2");
    expect((await db.tracks.where("[artistName+likedAt]").between(["", 1], ["￿", Infinity]).primaryKeys())).toContain("t2");

    // v12: cover duplicates collapsed to the newest; v13: the key is unique.
    expect(await db.covers.count()).toBe(2);
    expect((await db.covers.where("[ownerType+ownerId]").equals(["album", "al1"]).first())?.id).toBe("c-new");
    expect(db.covers.schema.indexes.find(i => i.name === "[ownerType+ownerId]")?.unique).toBe(true);
    await expect(db.covers.add({ id: "c-dup", ownerType: "album", ownerId: "al1", blob: new Blob(), mimeType: "image/webp", addedAt: 9, updatedAt: 9 }))
      .rejects.toThrow();

    // v13: download-job lookup by track, pinned on albums/artists, dead
    // indexes gone.
    await db.downloadJobs.add({ id: "j1", trackId: "t1" as never, status: "queued", attempts: 0, addedAt: 1 });
    expect(await db.downloadJobs.where("[trackId+status]").equals(["t1", "queued"]).count()).toBe(1);
    expect(await db.albums.where("[artistId+pinned]").equals(["ar1", 1]).count()).toBe(1);
    expect(await db.artists.where("pinned").equals(1).count()).toBe(1);
    expect(await db.tracks.where("[albumId+pinned]").equals(["al1", 1]).count()).toBe(1);
    const indexNames = (name: keyof typeof db) => (db[name] as { schema: { indexes: { name: string }[] } }).schema.indexes.map(i => i.name);
    expect(indexNames("tracks")).not.toContain("state");
    expect(indexNames("tracks")).not.toContain("source");
    expect(indexNames("albums")).not.toContain("[artistId+year]");
    expect(indexNames("downloadJobs")).not.toContain("batchId");
    expect(indexNames("folders")).toEqual([]);

    db.close();
  });
});
