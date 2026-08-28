import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { TrackSource, TrackState, type AlbumEntity, type ArtistEntity, type TrackEntity } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TagId, TrackId } from "@/types/ids";
import { albumRepository } from "../album.repository";
import { artistRepository } from "../artist.repository";
import { coverRepository } from "../cover.repository";
import { downloadJobRepository } from "../downloadJob.repository";
import { playlistRepository } from "../playlist.repository";
import { tagRepository } from "../tag.repository";
import { trackRepository } from "../track.repository";

//
// Repository behaviour over real Dexie (fake-indexeddb): index-backed
// lookups introduced by schema v13 and the read-modify-write paths that were
// turned into single atomic operations.
//

const track = (id: string, overrides: Partial<TrackEntity> = {}): TrackEntity => ({
  id: id as TrackId,
  title: id,
  artistName: "A",
  albumTitle: "",
  artistIds: [],
  albumId: "" as AlbumId,
  tagIds: [],
  source: TrackSource.LOCAL_INTERNAL,
  pinned: 1,
  state: TrackState.READY,
  storagePath: `tracks/${id}.mp3`,
  duration: 100,
  format: {},
  playCount: 0,
  addedAt: 1,
  ...overrides,
});

const album = (id: string, overrides: Partial<AlbumEntity> = {}): AlbumEntity => ({
  id: id as AlbumId,
  title: id,
  artistId: "ar1" as ArtistId,
  pinned: 1,
  addedAt: 1,
  updatedAt: 1,
  ...overrides,
});

const artist = (id: string, overrides: Partial<ArtistEntity> = {}): ArtistEntity => ({
  id: id as ArtistId,
  name: id,
  pinned: 1,
  addedAt: 1,
  updatedAt: 1,
  ...overrides,
});

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
});

describe("downloadJobRepository (indexed by [trackId+status])", () => {
  const job = (id: string, trackId: string, status: "queued" | "running" | "done" | "error") =>
    ({ id, trackId: trackId as TrackId, status, attempts: 0, addedAt: 1 });

  it("findActiveByTrackId returns only a queued/running job of that track", async () => {
    await db.downloadJobs.bulkAdd([
      job("j-done", "t1", "done"),
      job("j-err", "t1", "error"),
      job("j-other", "t2", "queued"),
      job("j-run", "t1", "running"),
    ]);

    const found = await trackOf(downloadJobRepository.findActiveByTrackId("t1" as TrackId));
    expect(found?.id).toBe("j-run");
    expect(await trackOf(downloadJobRepository.findActiveByTrackId("t3" as TrackId))).toBeUndefined();
  });

  it("deleteErrorsByTrackId drops only the error rows of that track", async () => {
    await db.downloadJobs.bulkAdd([
      job("j-err1", "t1", "error"),
      job("j-err2", "t1", "error"),
      job("j-queued", "t1", "queued"),
      job("j-other", "t2", "error"),
    ]);

    const deleted = await trackOf(downloadJobRepository.deleteErrorsByTrackId("t1" as TrackId));

    expect(deleted).toBe(2);
    expect((await db.downloadJobs.toCollection().primaryKeys()).sort()).toEqual(["j-other", "j-queued"]);
  });
});

describe("coverRepository.upsertOwnerCover", () => {
  it("keeps a single row per owner across concurrent upserts", async () => {
    await Promise.all([
      coverRepository.upsertOwnerCover("album", "al1", new Blob(["a"])),
      coverRepository.upsertOwnerCover("album", "al1", new Blob(["b"])),
      coverRepository.upsertOwnerCover("album", "al1", new Blob(["c"])),
    ]);

    expect(await db.covers.count()).toBe(1);
  });

  it("updates the existing row in place, keeping its id", async () => {
    const first = await trackOf(coverRepository.upsertOwnerCover("playlist", "p1", new Blob(["a"])));
    const second = await trackOf(coverRepository.upsertOwnerCover("playlist", "p1", new Blob(["bb"], { type: "image/png" })));

    expect(second).toBe(first);
    expect(await db.covers.count()).toBe(1);
    expect((await db.covers.get(first))?.mimeType).toBe("image/png");
  });
});

describe("tagRepository.findOrCreate", () => {
  it("creates one row when the same name is requested concurrently", async () => {
    const results = await Promise.all([
      tagRepository.findOrCreate("Rock"),
      tagRepository.findOrCreate("rock "),
      tagRepository.findOrCreate("ROCK"),
    ]);

    const ids = new Set(results.map(r => r._unsafeUnwrap().id));
    expect(ids.size).toBe(1);
    expect(await db.tags.count()).toBe(1);
    expect((await db.tags.toArray())[0].name).toBe("rock");
  });
});

describe("trackRepository tag mutations", () => {
  it("addTagToTrack keeps both tags when two calls race", async () => {
    await db.tracks.add(track("t1"));

    await Promise.all([
      trackRepository.addTagToTrack("t1" as TrackId, "tag-a" as TagId),
      trackRepository.addTagToTrack("t1" as TrackId, "tag-b" as TagId),
    ]);

    expect((await db.tracks.get("t1" as TrackId))?.tagIds.sort()).toEqual(["tag-a", "tag-b"]);
  });

  it("addTagToTrack is idempotent and fails for an unknown track", async () => {
    await db.tracks.add(track("t1", { tagIds: ["tag-a" as TagId] }));

    await trackRepository.addTagToTrack("t1" as TrackId, "tag-a" as TagId);
    const missing = await trackRepository.addTagToTrack("nope" as TrackId, "tag-a" as TagId);

    expect((await db.tracks.get("t1" as TrackId))?.tagIds).toEqual(["tag-a"]);
    expect(missing.isErr()).toBe(true);
  });

  it("removeTagFromTrack removes just that tag", async () => {
    await db.tracks.add(track("t1", { tagIds: ["tag-a", "tag-b"] as TagId[] }));

    await trackRepository.removeTagFromTrack("t1" as TrackId, "tag-a" as TagId);

    expect((await db.tracks.get("t1" as TrackId))?.tagIds).toEqual(["tag-b"]);
  });
});

describe("trackRepository.findByIds", () => {
  it("returns rows in the requested order, skipping unknown ids", async () => {
    await db.tracks.bulkAdd([track("a"), track("b"), track("c")]);

    const rows = await trackOf(trackRepository.findByIds(["c", "x", "a"] as TrackId[]));

    expect(rows.map(r => r.id)).toEqual(["c", "a"]);
  });
});

describe("trackRepository.countByAlbumIds", () => {
  it("counts library tracks only, skipping shadow rows", async () => {
    await db.tracks.bulkAdd([
      track("t1", { albumId: "album-a" as AlbumId }),
      track("t2", { albumId: "album-a" as AlbumId }),
      track("t3", { albumId: "album-a" as AlbumId, pinned: 0 }),
    ]);

    const counts = await trackOf(trackRepository.countByAlbumIds(["album-a", "album-b"] as AlbumId[]));

    expect(counts.get("album-a" as AlbumId)).toBe(2);
    expect(counts.get("album-b" as AlbumId)).toBe(0);
  });

  it("returns an empty map for empty input", async () => {
    expect((await trackOf(trackRepository.countByAlbumIds([]))).size).toBe(0);
  });
});

describe("trackRepository bulk writes", () => {
  it("setAlbumTitleByAlbumId rewrites the denormalized title of every track in the album", async () => {
    await db.tracks.bulkAdd([
      track("t1", { albumId: "al1" as AlbumId, albumTitle: "Old" }),
      track("t2", { albumId: "al1" as AlbumId, albumTitle: "Old" }),
      track("t3", { albumId: "al2" as AlbumId, albumTitle: "Other" }),
    ]);

    const changed = await trackOf(trackRepository.setAlbumTitleByAlbumId("al1" as AlbumId, "New"));

    expect(changed).toBe(2);
    expect((await db.tracks.toArray()).map(t => t.albumTitle).sort()).toEqual(["New", "New", "Other"]);
  });

  it("likeMany stamps likedAt only on tracks that are not liked yet", async () => {
    await db.tracks.bulkAdd([
      track("t1"),
      track("t2", { likedAt: 5 }),
      track("t3"),
    ]);

    const changed = await trackOf(trackRepository.likeMany(["t1", "t2", "t3", "missing"] as TrackId[], 99));

    expect(changed).toBe(2);
    expect((await db.tracks.get("t2" as TrackId))?.likedAt).toBe(5);
    expect((await db.tracks.get("t1" as TrackId))?.likedAt).toBe(99);
    expect((await db.tracks.get("t3" as TrackId))?.likedAt).toBe(99);
  });
});

describe("albumRepository / artistRepository pinned lookups", () => {
  it("findPinned excludes shadow rows", async () => {
    await db.albums.bulkAdd([album("al1"), album("al2", { pinned: 0 })]);
    await db.artists.bulkAdd([artist("ar1"), artist("ar2", { pinned: 0 })]);

    expect((await trackOf(albumRepository.findPinned())).map(a => a.id)).toEqual(["al1"]);
    expect((await trackOf(artistRepository.findPinned())).map(a => a.id)).toEqual(["ar1"]);
  });

  it("countByArtistId and findByArtistIdPaginated skip shadow albums and order newest first", async () => {
    await db.albums.bulkAdd([
      album("al1", { year: 2001 }),
      album("al2", { year: 2003 }),
      album("al3", { year: 2002 }),
      album("al4", { year: 2010, pinned: 0 }),
      album("al5", { artistId: "ar2" as ArtistId }),
    ]);

    expect(await trackOf(albumRepository.countByArtistId("ar1" as ArtistId))).toBe(3);
    const page1 = await trackOf(albumRepository.findByArtistIdPaginated("ar1" as ArtistId, 0, 2));
    const page2 = await trackOf(albumRepository.findByArtistIdPaginated("ar1" as ArtistId, 2, 2));
    expect(page1.map(a => a.year)).toEqual([2003, 2002]);
    expect(page2.map(a => a.year)).toEqual([2001]);
  });
});

describe("playlistRepository.addTracks", () => {
  it("appends only the new ids in one write and reports them", async () => {
    await db.playlists.add({
      id: "p1" as PlaylistId, name: "P", trackIds: ["t1"] as TrackId[], addedAt: 1, updatedAt: 1,
    });
    const modifySpy = vi.spyOn(db.playlists, "update");

    const added = await trackOf(playlistRepository.addTracks("p1" as PlaylistId, ["t2", "t1", "t3", "t2"] as TrackId[]));

    expect(added).toEqual(["t2", "t3"]);
    expect((await db.playlists.get("p1" as PlaylistId))?.trackIds).toEqual(["t1", "t2", "t3"]);
    expect(modifySpy).not.toHaveBeenCalled();
  });
});

async function trackOf<T>(promise: Promise<{ _unsafeUnwrap: () => T }>): Promise<T> {
  return (await promise)._unsafeUnwrap();
}
