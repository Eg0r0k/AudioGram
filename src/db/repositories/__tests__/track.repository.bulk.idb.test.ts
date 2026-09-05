import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";

vi.mock("@/db/storage", () => ({ storageService: { deleteFile: vi.fn() } }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { db } from "@/db";
import { trackRepository } from "../track.repository";

const track = (id: string, title: string, addedAt: number, likedAt?: number): TrackEntity => ({
  id: TrackId(id),
  title,
  artistIds: [ArtistId("a-1")],
  albumId: AlbumId("al-1"),
  tagIds: [],
  source: TrackSource.LOCAL,
  state: TrackState.READY,
  storagePath: `tracks/${id}.mp3`,
  duration: 100,
  format: {},
  playCount: 0,
  addedAt,
  likedAt,
  albumTitle: "Album",
  artistName: "Artist",
} as unknown as TrackEntity);

describe("trackRepository bulk helpers (idb)", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    await db.tracks.bulkPut([
      track("t-1", "Bravo", 1, 10),
      track("t-2", "Alpha", 2, 20),
      track("t-3", "Charlie", 3),
    ]);
  });

  it("unlikeMany clears likedAt only on liked rows and reports the count", async () => {
    const result = await trackRepository.unlikeMany([TrackId("t-1"), TrackId("t-2"), TrackId("t-3")]);

    expect(result._unsafeUnwrap()).toBe(2);
    const rows = await db.tracks.toArray();
    expect(rows.every(row => row.likedAt === undefined)).toBe(true);
  });

  it("unlikeMany with no ids touches nothing", async () => {
    const result = await trackRepository.unlikeMany([]);
    expect(result._unsafeUnwrap()).toBe(0);
    expect((await db.tracks.get(TrackId("t-1")))?.likedAt).toBe(10);
  });

  it("findAllIdsSorted returns ids in sort order without entities", async () => {
    const byTitle = await trackRepository.findAllIdsSorted("title_asc");
    expect(byTitle._unsafeUnwrap()).toEqual([TrackId("t-2"), TrackId("t-1"), TrackId("t-3")]);

    const newestFirst = await trackRepository.findAllIdsSorted("date_added_desc");
    expect(newestFirst._unsafeUnwrap()).toEqual([TrackId("t-3"), TrackId("t-2"), TrackId("t-1")]);
  });
});
