import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";
import { statsRepository } from "@/db/repositories/stats.repository";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { statsQueries } from "../stats.queries";

//
// The stats page mounts ~8 aggregate queries for the same period. They must
// share ONE read of listenEvents (the events query) instead of each pulling
// the whole table.
//

let seq = 0;
const event = (overrides: Partial<ListenEventEntity> = {}): ListenEventEntity => ({
  id: `e${++seq}`,
  trackId: "t1" as TrackId,
  artistId: "a1" as ArtistId,
  albumId: "al1" as AlbumId,
  startedAt: 1_000_000,
  secondsListened: 100,
  trackDuration: 200,
  completed: true,
  skipped: false,
  ...overrides,
});

describe("stats queries share one events read", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.restoreAllMocks();
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    await db.listenEvents.bulkAdd([
      event({ secondsListened: 120 }),
      event({ trackId: "t2" as TrackId, artistId: "a2" as ArtistId, secondsListened: 30, skipped: true }),
      event({ startedAt: 500 }), // before `since`
    ]);
  });

  it("aggregates for one period read listenEvents once", async () => {
    const read = vi.spyOn(statsRepository, "eventsSince");
    const since = 900;

    const [summary, total, hourly, records] = await Promise.all([
      queryClient.fetchQuery(statsQueries.summary(since)),
      queryClient.fetchQuery(statsQueries.totalTime(since)),
      queryClient.fetchQuery(statsQueries.hourlyActivity(since)),
      queryClient.fetchQuery(statsQueries.records(since)),
    ]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(since);
    expect(summary).toMatchObject({ totalSeconds: 150, playsCount: 1, skippedCount: 1 });
    expect(total).toBe(150);
    expect(hourly.reduce((a, b) => a + b, 0)).toBe(150);
    expect(records.mostRepeatedTrackId).toBe("t1");
  });

  it("a different period is a different read", async () => {
    const read = vi.spyOn(statsRepository, "eventsSince");

    await queryClient.fetchQuery(statsQueries.summary(900));
    await queryClient.fetchQuery(statsQueries.summary(undefined));

    expect(read).toHaveBeenCalledTimes(2);
    expect((await queryClient.fetchQuery(statsQueries.summary(undefined))).totalSeconds).toBe(250);
  });
});
