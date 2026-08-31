import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok, okAsync, errAsync } from "neverthrow";
import { PlaylistId, TrackId } from "@/types/ids";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";

const repos = vi.hoisted(() => ({
  track: { findById: vi.fn(), update: vi.fn() },
  playlist: { findAll: vi.fn(), update: vi.fn() },
  offlineCopy: { findById: vi.fn(), delete: vi.fn() },
}));

const uow = vi.hoisted(() => ({ runScoped: vi.fn() }));
const dexie = vi.hoisted(() => {
  const count = vi.fn();
  return {
    albums: { update: vi.fn() },
    artists: { update: vi.fn() },
    tracks: { where: vi.fn(() => ({ equals: vi.fn(() => ({ and: vi.fn(() => ({ count })), count })) })) },
    pinnedCount: count,
  };
});
const storage = vi.hoisted(() => ({ deleteFile: vi.fn() }));

vi.mock("@/db", () => ({ db: { tracks: dexie.tracks, albums: dexie.albums, artists: dexie.artists, playlists: {}, offlineCopies: {} } }));
vi.mock("@/db/repositories", () => ({
  trackRepository: repos.track,
  playlistRepository: repos.playlist,
  offlineCopyRepository: repos.offlineCopy,
}));
vi.mock("@/db/unit-of-work", () => ({ unitOfWork: uow }));
vi.mock("@/db/storage", () => ({ storageService: storage }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

const searchIndex = vi.hoisted(() => ({
  indexImportedTracks: vi.fn(async () => {}),
  removeSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/searchIndex", () => searchIndex);

import { promoteTrackToLibrary, removeTrackFromLibrary } from "../libraryMembership";

const TRACK_ID = ndTrackId("song1");

describe("promoteTrackToLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uow.runScoped.mockImplementation(async (_tables: unknown, cb: () => Promise<unknown>) => ok(await cb()));
    repos.track.findById.mockResolvedValue(ok({
      id: TRACK_ID,
      albumId: ndAlbumId("album1"),
      artistIds: [ndArtistId("artist1"), ndArtistId("artist2")],
    }));
    repos.track.update.mockResolvedValue(ok(1));
    dexie.albums.update.mockResolvedValue(1);
    dexie.artists.update.mockResolvedValue(1);
  });

  it("cascades pinned = 1 onto the track, its album and its artists in one UoW", async () => {
    await promoteTrackToLibrary(TRACK_ID);

    expect(uow.runScoped).toHaveBeenCalledTimes(1);
    expect(repos.track.update).toHaveBeenCalledWith(TRACK_ID, { pinned: 1 });
    expect(dexie.albums.update).toHaveBeenCalledWith(ndAlbumId("album1"), { pinned: 1 });
    expect(dexie.artists.update).toHaveBeenCalledTimes(2);
  });

  it("mirrors the promoted family into the search index", async () => {
    await promoteTrackToLibrary(TRACK_ID);

    expect(searchIndex.indexImportedTracks).toHaveBeenCalledWith([TRACK_ID]);
  });

  it("throws when the track does not exist", async () => {
    repos.track.findById.mockResolvedValue(ok(undefined));

    await expect(promoteTrackToLibrary(TRACK_ID)).rejects.toThrow(/Track not found/);
  });
});

describe("removeTrackFromLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uow.runScoped.mockImplementation(async (_tables: unknown, cb: () => Promise<unknown>) => ok(await cb()));
    repos.track.findById.mockResolvedValue(ok({
      id: TRACK_ID,
      albumId: ndAlbumId("album1"),
      artistIds: [ndArtistId("artist1")],
    }));
    dexie.pinnedCount.mockResolvedValue(0);
    repos.offlineCopy.findById.mockResolvedValue(ok({
      trackId: TRACK_ID,
      storagePath: "offline/nd/song1.flac",
      sizeBytes: 1,
      format: {},
      downloadedAt: 0,
    }));
    repos.offlineCopy.delete.mockResolvedValue(ok(undefined));
    repos.playlist.findAll.mockResolvedValue(ok([
      { id: PlaylistId("p1"), trackIds: [TRACK_ID, TrackId("other")] },
      { id: PlaylistId("p2"), trackIds: [TrackId("other")] },
    ]));
    repos.playlist.update.mockResolvedValue(ok(1));
    repos.track.update.mockResolvedValue(ok(1));
    storage.deleteFile.mockReturnValue(okAsync(undefined));
  });

  it("degrades the row to shadow, cascades playlists/like/copy and deletes the file", async () => {
    await removeTrackFromLibrary(TRACK_ID);

    expect(uow.runScoped).toHaveBeenCalledTimes(1);
    expect(repos.playlist.update).toHaveBeenCalledTimes(1);
    expect(repos.playlist.update).toHaveBeenCalledWith(PlaylistId("p1"), { trackIds: [TrackId("other")] });
    expect(repos.track.update).toHaveBeenCalledWith(TRACK_ID, { pinned: 0, likedAt: undefined });
    expect(repos.offlineCopy.delete).toHaveBeenCalledWith(TRACK_ID);
    expect(storage.deleteFile).toHaveBeenCalledWith("offline/nd/song1.flac");
  });

  it("degrades the shadow album/artist when no pinned tracks remain", async () => {
    await removeTrackFromLibrary(TRACK_ID);

    expect(dexie.albums.update).toHaveBeenCalledWith(ndAlbumId("album1"), { pinned: 0 });
    expect(dexie.artists.update).toHaveBeenCalledWith(ndArtistId("artist1"), { pinned: 0 });
  });

  it("keeps album/artist pinned while other library tracks remain", async () => {
    dexie.pinnedCount.mockResolvedValue(2);

    await removeTrackFromLibrary(TRACK_ID);

    expect(dexie.albums.update).not.toHaveBeenCalled();
    expect(dexie.artists.update).not.toHaveBeenCalled();
  });

  it("de-indexes the track and every demoted album/artist", async () => {
    await removeTrackFromLibrary(TRACK_ID);

    expect(searchIndex.removeSearchDocuments).toHaveBeenCalledWith([
      `track:${TRACK_ID}`,
      `album:${ndAlbumId("album1")}`,
      `artist:${ndArtistId("artist1")}`,
    ]);
  });

  it("de-indexes only the track while the album/artist stay pinned", async () => {
    dexie.pinnedCount.mockResolvedValue(2);

    await removeTrackFromLibrary(TRACK_ID);

    expect(searchIndex.removeSearchDocuments).toHaveBeenCalledWith([`track:${TRACK_ID}`]);
  });

  it("skips file deletion when there is no offline copy", async () => {
    repos.offlineCopy.findById.mockResolvedValue(ok(undefined));

    await removeTrackFromLibrary(TRACK_ID);

    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it("survives a failing file delete (DB cascade already committed)", async () => {
    storage.deleteFile.mockReturnValue(errAsync(new Error("locked")));

    await expect(removeTrackFromLibrary(TRACK_ID)).resolves.toBeUndefined();
  });
});
