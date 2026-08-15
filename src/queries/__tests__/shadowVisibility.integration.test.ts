import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import { ArtistId } from "@/types/ids";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources/types";

// Shadow rows (pinned = 0) stay invisible to every library surface; a full
// pin flips the family to pinned = 1 and makes it visible everywhere.

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/searchIndex", () => ({
  indexImportedTracks: vi.fn(async () => {}),
  removeSearchDocuments: vi.fn(async () => {}),
  upsertSearchDocuments: vi.fn(async () => {}),
  searchTracks: vi.fn(async () => ({ tracks: [], total: 0, totalDuration: 0 })),
}));

import { db } from "@/db";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { buildAllSearchDocuments } from "@/modules/search/buildDocuments";
import { getLibrarySummary } from "../library.queries";
import { getTracksIndexPageData } from "../track.queries";
import { getArtistPageData } from "../artist.queries";

const dto: SourceTrackDTO = {
  id: ndTrackId("song1"),
  title: "Remote Song",
  artistName: "Remote Artist",
  albumTitle: "Remote Album",
  albumId: ndAlbumId("album1"),
  artistIds: [ndArtistId("artist1")],
  duration: 240,
};

describe("shadow rows stay invisible to library surfaces (integration)", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("playing from browsing (shadow pin) grows no library list", async () => {
    await ensurePinned({ kind: "remote", dto }, { pinned: 0 });

    const summary = await getLibrarySummary();
    expect(summary.albums).toHaveLength(0);
    expect(summary.artists).toHaveLength(0);

    const indexPage = await getTracksIndexPageData("date_added_desc");
    expect(indexPage.tracks).toHaveLength(0);
    expect(indexPage.total).toBe(0);
    expect(indexPage.totalDuration).toBe(0);

    const documents = await buildAllSearchDocuments();
    expect(documents).toHaveLength(0);
  });

  it("a full pin makes the family visible everywhere", async () => {
    await ensurePinned({ kind: "remote", dto });

    const summary = await getLibrarySummary();
    expect(summary.albums.map(album => album.id)).toEqual([ndAlbumId("album1")]);
    expect(summary.albums[0]?.trackCount).toBe(1);
    expect(summary.artists.map(artist => artist.id)).toEqual([ndArtistId("artist1")]);
    expect(summary.artists[0]?.trackCount).toBe(1);

    const indexPage = await getTracksIndexPageData("date_added_desc");
    expect(indexPage.tracks.map(track => track.id)).toEqual([dto.id]);
    expect(indexPage.total).toBe(1);
    expect(indexPage.totalDuration).toBe(240);

    const documents = await buildAllSearchDocuments();
    expect(documents.map(document => document.id).sort()).toEqual([
      `album:${ndAlbumId("album1")}`,
      `artist:${ndArtistId("artist1")}`,
      `track:${dto.id}`,
    ]);
  });

  it("sidebar counts skip shadow siblings of a pinned album", async () => {
    await ensurePinned({ kind: "remote", dto });
    const sibling: SourceTrackDTO = { ...dto, id: ndTrackId("song2"), title: "Sibling" };
    await ensurePinned({ kind: "remote", dto: sibling }, { pinned: 0 });

    const summary = await getLibrarySummary();
    expect(summary.albums[0]?.trackCount).toBe(1);
    expect(summary.artists[0]?.trackCount).toBe(1);
  });

  it("a local artist page skips absorbed shadow tracks and albums", async () => {
    // A same-named local artist absorbs remote pins instead of a shadow row.
    const localArtistId = ArtistId("local-artist");
    await db.artists.put({ id: localArtistId, name: "Remote Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.tracks.put({
      id: "local-track",
      title: "Local Song",
      artistIds: [localArtistId],
      albumId: "",
      tagIds: [],
      source: TrackSource.LOCAL,
      state: TrackState.READY,
      pinned: 1,
      duration: 60,
      format: {},
      playCount: 0,
      addedAt: 1,
      updatedAt: 1,
      artistName: "Remote Artist",
    } as never);

    await ensurePinned({ kind: "remote", dto }, { pinned: 0 });
    expect((await db.tracks.get(dto.id))?.artistIds).toEqual([localArtistId]);

    const page = await getArtistPageData(localArtistId);
    expect(page.tracks.map(track => track.id)).toEqual(["local-track"]);
    expect(page.albums).toHaveLength(0);
  });
});
