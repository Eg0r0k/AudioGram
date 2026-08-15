import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources";

vi.mock("@/db/storage", () => ({
  storageService: { deleteFile: vi.fn() },
}));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/searchIndex", () => ({
  indexImportedTracks: vi.fn(async () => {}),
  removeSearchDocuments: vi.fn(async () => {}),
}));

import { db } from "@/db";
import { trackRepository } from "@/db/repositories";
import { ensurePinned } from "../ensurePinned";
import { removeTrackFromLibrary } from "../libraryMembership";

//
// End-to-end over real Dexie (fake-indexeddb): browsing → like →
// removeFromLibrary. The row degrades to a shadow and no ghost album or
// artist stays in the library.
//

const dto: SourceTrackDTO = {
  id: ndTrackId("song1"),
  title: "Remote Song",
  artistName: "Artist A",
  albumTitle: "Remote Album",
  albumId: ndAlbumId("album1"),
  artistIds: [ndArtistId("artist1")],
  duration: 240,
};

describe("browse → like → removeFromLibrary (integration)", () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("degrades the row to shadow and leaves no ghost album/artist", async () => {
    // Playback from browsing: shadow-pin.
    await ensurePinned({ kind: "remote", dto }, { pinned: 0 });
    expect((await db.tracks.get(dto.id))?.pinned).toBe(0);

    // Like: pin-on-demand upgrades the whole cascade to library members.
    const track = await ensurePinned({ kind: "remote", dto });
    await trackRepository.setLiked(track.id, true);
    expect((await db.tracks.get(dto.id))?.pinned).toBe(1);
    expect((await db.albums.get(ndAlbumId("album1")))?.pinned).toBe(1);
    expect((await db.artists.get(ndArtistId("artist1")))?.pinned).toBe(1);

    await removeTrackFromLibrary(dto.id);

    const row = await db.tracks.get(dto.id);
    expect(row?.pinned).toBe(0);
    expect(row?.likedAt).toBeUndefined();
    // History survives: the row still exists as a shadow.
    expect(row).toBeDefined();
    // No ghosts: the shadow album/artist left the library with it.
    expect((await db.albums.get(ndAlbumId("album1")))?.pinned).toBe(0);
    expect((await db.artists.get(ndArtistId("artist1")))?.pinned).toBe(0);
  });

  it("keeps the album pinned while a second library track remains", async () => {
    const sibling: SourceTrackDTO = { ...dto, id: ndTrackId("song2"), title: "Second" };
    await ensurePinned({ kind: "remote", dto });
    await ensurePinned({ kind: "remote", dto: sibling });

    await removeTrackFromLibrary(dto.id);

    expect((await db.tracks.get(dto.id))?.pinned).toBe(0);
    expect((await db.albums.get(ndAlbumId("album1")))?.pinned).toBe(1);
    expect((await db.artists.get(ndArtistId("artist1")))?.pinned).toBe(1);
  });
});
