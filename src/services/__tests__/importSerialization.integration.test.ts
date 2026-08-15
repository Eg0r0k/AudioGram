import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource } from "@/db/entities";
import { TrackId } from "@/types/ids";
import type { TrackToSave } from "../types";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { db } from "@/db";
import { EntityResolver } from "../entity-resolver";
import { persistTracks } from "../import/track-persister";
import { importQueue } from "../import/import-queue";

// Concurrent imports would mint duplicate artist/album rows (per-instance
// resolver cache) — the import queue serializes them.

function trackToSave(id: string, artist: string): TrackToSave {
  return {
    trackId: TrackId(id),
    fileName: `${id}.mp3`,
    storagePath: `tracks/${id}.mp3`,
    fingerprint: `fp-${id}`,
    source: TrackSource.LOCAL_INTERNAL,
    meta: {
      title: `Song ${id}`,
      artists: [artist],
      album: "Same Album",
      duration: 100,
      format: {},
    },
  };
}

/** One import pipeline run the way every entry point performs it. */
function importOne(item: TrackToSave): Promise<void> {
  return importQueue(async () => {
    const resolver = new EntityResolver();
    await resolver.resolve([item.meta]);
    await persistTracks([item], resolver);
  });
}

describe("import serialization (integration)", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("two concurrent imports of the same artist produce a single artist row", async () => {
    await Promise.all([
      importOne(trackToSave("t-1", "Same Artist")),
      importOne(trackToSave("t-2", "Same Artist")),
    ]);

    const artists = await db.artists.toArray();
    expect(artists).toHaveLength(1);
    expect(artists[0].name).toBe("Same Artist");

    // Both tracks landed and share the one artist row (and its album).
    const tracks = await db.tracks.toArray();
    expect(tracks).toHaveLength(2);
    expect(new Set(tracks.flatMap(track => track.artistIds)).size).toBe(1);
    expect(await db.albums.count()).toBe(1);
  });

  it("case- and whitespace-variant names still collapse onto one row across imports", async () => {
    await Promise.all([
      importOne(trackToSave("t-1", "Same Artist")),
      importOne(trackToSave("t-2", "  same artist ")),
    ]);

    expect(await db.artists.count()).toBe(1);
  });
});
