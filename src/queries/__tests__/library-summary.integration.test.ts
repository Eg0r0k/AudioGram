import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";

vi.mock("@/modules/covers/lib/cover-cache", () => ({
  coverCache: { invalidateAll: vi.fn(), invalidate: vi.fn(), set: vi.fn() },
}));

import { db } from "@/db";
import { getLibrarySummary } from "../library.queries";

const track = (id: string, likedAt?: number): TrackEntity => ({
  id: TrackId(id),
  title: id,
  artistIds: [ArtistId("a-1")],
  albumId: AlbumId("al-1"),
  tagIds: [],
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  storagePath: `tracks/${id}.mp3`,
  duration: 10,
  format: {},
  playCount: 0,
  pinned: 1,
  addedAt: 1,
  likedAt,
} as unknown as TrackEntity);

describe("getLibrarySummary", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    await db.tracks.bulkPut([track("t-1", 3), track("t-2", 2), track("t-3")]);
  });

  // The sidebar shows a count; loading every liked row for it is what made
  // the summary the heaviest read in the app.
  it("carries the liked count, not the liked rows", async () => {
    const summary = await getLibrarySummary();

    expect(summary.likedCount).toBe(2);
    expect(summary).not.toHaveProperty("likedTracks");
  });
});
