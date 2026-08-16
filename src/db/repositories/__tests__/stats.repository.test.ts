import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { statsRepository } from "../stats.repository";

let seq = 0;
function makeEvent(overrides: Partial<ListenEventEntity> = {}): ListenEventEntity {
  seq += 1;
  return {
    id: `e${seq}`,
    trackId: "t1" as TrackId,
    artistId: "a1" as ArtistId,
    albumId: "al1" as AlbumId,
    startedAt: Date.now(),
    secondsListened: 100,
    trackDuration: 200,
    completed: true,
    skipped: false,
    ...overrides,
  };
}

async function seed(...events: ListenEventEntity[]) {
  await db.listenEvents.bulkAdd(events);
}

beforeEach(async () => {
  await db.open();
  await db.listenEvents.clear();
});

describe("summary", () => {
  it("returns zeros when there are no events", async () => {
    const result = await statsRepository.summary();
    expect(result._unsafeUnwrap()).toEqual({
      totalSeconds: 0,
      playsCount: 0,
      uniqueTracks: 0,
      uniqueArtists: 0,
      completedCount: 0,
      skippedCount: 0,
    });
  });

  it("aggregates seconds, plays, uniques, completed and skipped", async () => {
    await seed(
      makeEvent({ trackId: "t1" as TrackId, artistId: "a1" as ArtistId, secondsListened: 60, completed: true }),
      makeEvent({ trackId: "t1" as TrackId, artistId: "a1" as ArtistId, secondsListened: 40, completed: false }),
      makeEvent({ trackId: "t2" as TrackId, artistId: "a2" as ArtistId, secondsListened: 30, completed: false, skipped: true }),
    );
    const s = (await statsRepository.summary())._unsafeUnwrap();
    // totalSeconds включает и пропущенные события; plays/uniques — только не-skipped.
    expect(s.totalSeconds).toBe(130);
    expect(s.playsCount).toBe(2);
    expect(s.uniqueTracks).toBe(1);
    expect(s.uniqueArtists).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.skippedCount).toBe(1);
  });

  it("respects the since filter", async () => {
    const now = Date.now();
    await seed(
      makeEvent({ startedAt: now - 10 * 86_400_000, secondsListened: 500 }),
      makeEvent({ startedAt: now - 1000, secondsListened: 60 }),
    );
    const s = (await statsRepository.summary(now - 86_400_000))._unsafeUnwrap();
    expect(s.totalSeconds).toBe(60);
    expect(s.playsCount).toBe(1);
  });
});

describe("deleteAllEvents", () => {
  it("removes every listen event", async () => {
    await seed(makeEvent(), makeEvent(), makeEvent());
    (await statsRepository.deleteAllEvents())._unsafeUnwrap();
    expect(await db.listenEvents.count()).toBe(0);
  });
});
