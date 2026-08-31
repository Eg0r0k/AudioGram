import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isProxy, reactive } from "vue";
import type { SourceTrackDTO } from "@/modules/sources/types";
import { ArtistId, AlbumId, TrackId } from "@/types/ids";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/searchIndex", () => ({
  indexImportedTracks: vi.fn(async () => {}),
}));

import { db } from "@/db";
import { ensurePinned } from "../ensurePinned";

// DTOs from page composables are deep-reactive Vue proxies; IndexedDB's
// structured clone rejects proxies — every pin write died with DataCloneError.

function plainDto(): SourceTrackDTO {
  return {
    id: TrackId("nd:s1"),
    title: "Song",
    artistName: "Artist",
    albumTitle: "Album",
    artistIds: [ArtistId("nd:ar1")],
    albumId: AlbumId("nd:al1"),
    duration: 100,
    format: { codec: "flac" },
  } as unknown as SourceTrackDTO;
}

describe("ensurePinned with reactive DTOs (integration)", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("pins a deep-reactive DTO without DataCloneError", async () => {
    const dto = reactive(plainDto()) as SourceTrackDTO;
    expect(isProxy(dto.artistIds)).toBe(true);

    const track = await ensurePinned({ kind: "remote", dto });

    expect(track.id).toBe("nd:s1");
    const row = await db.tracks.get(TrackId("nd:s1"));
    expect(row?.artistIds).toEqual([ArtistId("nd:ar1")]);
    expect(await db.albums.get(AlbumId("nd:al1"))).toBeDefined();
    expect(await db.artists.get(ArtistId("nd:ar1"))).toBeDefined();
  });

  it("stores plain (non-proxy) rows", async () => {
    const dto = reactive(plainDto()) as SourceTrackDTO;
    await ensurePinned({ kind: "remote", dto });

    const row = await db.tracks.get(TrackId("nd:s1"));
    expect(isProxy(row?.artistIds)).toBe(false);
    expect(isProxy(row?.format)).toBe(false);
  });
});
