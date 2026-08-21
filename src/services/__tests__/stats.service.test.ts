import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { statsService } from "@/services/stats.service";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";

const TRACK_ID = "track-1" as TrackId;
const ARTIST_ID = "artist-1" as ArtistId;
const ALBUM_ID = "album-1" as AlbumId;
const DURATION = 200;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const lastEvent = async () => {
  const events = await db.listenEvents.toArray();
  return events.sort((a, b) => a.startedAt - b.startedAt)[events.length - 1];
};

describe("statsService skip detection", () => {
  beforeEach(async () => {
    await db.listenEvents.clear();
    await db.tracks.clear();
    await db.tracks.add({ id: TRACK_ID, playCount: 0 } as never);
    // Drain any pending event left over from a previous test.
    await statsService.stopListening(0, { skipped: true });
    await db.listenEvents.clear();
  });

  it("records a mid-track interruption as skipped, without a play count", async () => {
    statsService.startListening(TRACK_ID, ARTIST_ID, ALBUM_ID, DURATION);
    await flush();

    await statsService.stopListening(30, { skipped: true });
    await flush();

    const event = await lastEvent();
    expect(event.skipped).toBe(true);
    expect(event.completed).toBe(false);
    expect((await db.tracks.get(TRACK_ID))?.playCount ?? 0).toBe(0);
  });

  it("treats a near-complete listen as played even when it was interrupted", async () => {
    statsService.startListening(TRACK_ID, ARTIST_ID, ALBUM_ID, DURATION);
    await flush();

    await statsService.stopListening(DURATION * 0.9, { skipped: true });
    await flush();

    const event = await lastEvent();
    expect(event.skipped).toBe(false);
    expect(event.completed).toBe(true);
    expect((await db.tracks.get(TRACK_ID))?.playCount ?? 0).toBe(1);
  });

  it("closes a leaked session as an unmeasured skip, not wall-clock time", async () => {
    statsService.startListening(TRACK_ID, ARTIST_ID, ALBUM_ID, DURATION);
    await flush();

    // A second start without an intervening stop (session leak). The old
    // wall-clock fallback fabricated listen time — hours if the app sat
    // paused or throttled in the background — inflating completions and
    // play counts.
    statsService.startListening("track-2" as TrackId, ARTIST_ID, ALBUM_ID, DURATION);
    await flush();

    const events = await db.listenEvents.toArray();
    const leaked = events.find(event => event.trackId === TRACK_ID)!;
    expect(leaked.secondsListened).toBe(0);
    expect(leaked.skipped).toBe(true);
    expect(leaked.completed).toBe(false);
    expect((await db.tracks.get(TRACK_ID))?.playCount ?? 0).toBe(0);

    await statsService.stopListening(0, { skipped: true });
  });

  it("records a natural end as completed, not skipped", async () => {
    statsService.startListening(TRACK_ID, ARTIST_ID, ALBUM_ID, DURATION);
    await flush();

    await statsService.stopListening(120, { completed: true });
    await flush();

    const event = await lastEvent();
    expect(event.skipped).toBe(false);
    expect(event.completed).toBe(true);
    expect((await db.tracks.get(TRACK_ID))?.playCount ?? 0).toBe(1);
  });
});
