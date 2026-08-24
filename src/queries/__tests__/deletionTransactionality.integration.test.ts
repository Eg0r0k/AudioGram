import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, okAsync } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";
import { ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";

// Destructive multi-table cascades are one Dexie transaction; file cleanup
// and search sync run strictly after the commit.

const storageMock = vi.hoisted(() => ({
  deleteFile: vi.fn(),
}));

vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/searchIndex", () => ({
  removeSearchDocuments: vi.fn(async () => {}),
  upsertSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/buildDocuments", () => ({
  buildAlbumDocFromDb: vi.fn(async () => ({})),
  buildTrackDocFromDb: vi.fn(async () => ({})),
  buildArtistDoc: vi.fn(() => ({})),
}));

const gcMock = vi.hoisted(() => ({
  cleanup: vi.fn(),
  actual: undefined as undefined | ((removed: unknown[]) => Promise<void>),
}));

vi.mock("@/services/library-gc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/library-gc")>();
  gcMock.actual = actual.cleanupAfterTrackRemoval;
  return { ...actual, cleanupAfterTrackRemoval: gcMock.cleanup };
});

import { db } from "@/db";
import { artistRepository, offlineCopyRepository } from "@/db/repositories";
import { removeSearchDocuments } from "@/modules/search/searchIndex";
import { deleteAlbumAndSync } from "../album.queries";
import { deleteArtistAndSync } from "../artist.queries";
import { deleteTrackAndSync } from "../track.queries";
import type { Track } from "@/modules/player/types";

const ytArtist = ytArtistId("UC1");
const ytAlbum = ytAlbumId("MPREb1");
const playlistId = PlaylistId("pl-1");

function ytTrack(videoId: string, title: string): TrackEntity {
  return {
    id: ytTrackId(videoId),
    title,
    artistIds: [ytArtist],
    albumId: ytAlbum,
    tagIds: [],
    source: TrackSource.REMOTE_YT,
    state: TrackState.READY,
    pinned: 1,
    duration: 100,
    format: {},
    playCount: 0,
    addedAt: 1,
    albumTitle: "Shadow Album",
    artistName: "Shadow Artist",
  } as unknown as TrackEntity;
}

async function seedRemoteAlbum() {
  await db.artists.put({ id: ytArtist, name: "Shadow Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
  const album: AlbumEntity = { id: ytAlbum, title: "Shadow Album", artistId: ytArtist, pinned: 1, addedAt: 1, updatedAt: 1 };
  await db.albums.put(album);
  await db.tracks.bulkPut([ytTrack("v1", "One"), ytTrack("v2", "Two")]);
  await db.offlineCopies.bulkPut([
    { trackId: ytTrackId("v1"), storagePath: "offline/yt/v1.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 },
    { trackId: ytTrackId("v2"), storagePath: "offline/yt/v2.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 },
  ]);
  await db.playlists.put({
    id: playlistId,
    name: "Mix",
    trackIds: [ytTrackId("v1"), ytTrackId("v2")],
    addedAt: 1,
    updatedAt: 1,
  });
  return album;
}

async function snapshotCounts() {
  return {
    tracks: await db.tracks.count(),
    albums: await db.albums.count(),
    artists: await db.artists.count(),
    playlists: await db.playlists.count(),
    offlineCopies: await db.offlineCopies.count(),
    covers: await db.covers.count(),
  };
}

describe("deletion transactionality (integration)", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    gcMock.cleanup.mockImplementation(gcMock.actual!);
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("deleteTrackAndSync: a crash mid-cascade rolls back every table", async () => {
    await seedRemoteAlbum();
    const before = await snapshotCounts();
    gcMock.cleanup.mockImplementationOnce(async () => {
      throw new Error("boom mid-transaction");
    });

    await expect(
      deleteTrackAndSync(queryClient, { id: ytTrackId("v1") } as unknown as Track),
    ).rejects.toThrow("boom mid-transaction");

    expect(await snapshotCounts()).toEqual(before);
    const playlist = await db.playlists.get(playlistId);
    expect(playlist?.trackIds).toContain(ytTrackId("v1"));
    // Post-commit effects must not run for a rolled-back transaction.
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
    expect(vi.mocked(removeSearchDocuments)).not.toHaveBeenCalled();
  });

  it("deleteAlbumAndSync (remote): a crash mid-cascade rolls back every table", async () => {
    const album = await seedRemoteAlbum();
    const before = await snapshotCounts();
    gcMock.cleanup.mockImplementationOnce(async () => {
      throw new Error("boom mid-transaction");
    });

    await expect(deleteAlbumAndSync(queryClient, album, { deleteTracks: true })).rejects.toThrow("boom mid-transaction");

    expect(await snapshotCounts()).toEqual(before);
    const playlist = await db.playlists.get(playlistId);
    expect(playlist?.trackIds).toEqual([ytTrackId("v1"), ytTrackId("v2")]);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
    expect(vi.mocked(removeSearchDocuments)).not.toHaveBeenCalled();
  });

  it("deleteArtistAndSync: a failing row delete rolls back track updates and album deletes", async () => {
    const artistId = ArtistId("a-1");
    const albumId = AlbumId("al-1");
    await db.artists.put({ id: artistId, name: "Local", pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.albums.put({ id: albumId, title: "Local Album", artistId, pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.tracks.put({
      id: TrackId("t-1"),
      title: "Local Track",
      artistIds: [artistId],
      artistName: "Local",
      albumId,
      albumTitle: "Local Album",
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "tracks/t1.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
    } as unknown as TrackEntity);
    const before = await snapshotCounts();

    const deleteSpy = vi.spyOn(artistRepository, "delete")
      .mockResolvedValueOnce(err(new Error("boom mid-transaction")));
    try {
      await expect(
        deleteArtistAndSync(queryClient, (await db.artists.get(artistId))!),
      ).rejects.toThrow("boom mid-transaction");
    }
    finally {
      deleteSpy.mockRestore();
    }

    expect(await snapshotCounts()).toEqual(before);
    const track = await db.tracks.get(TrackId("t-1"));
    expect(track?.artistIds).toEqual([artistId]);
    expect(track?.albumTitle).toBe("Local Album");
    expect(await db.albums.get(albumId)).toBeDefined();
    expect(vi.mocked(removeSearchDocuments)).not.toHaveBeenCalled();
  });

  it("deleteTrackAndSync: a rename racing the cascade survives — the cascade owns only trackIds", async () => {
    await seedRemoteAlbum();

    // Deterministically land a concurrent metadata edit in the window
    // between the pre-reads and the transaction: the offline-copy pre-read
    // is the last await before the transaction opens.
    const spy = vi.spyOn(offlineCopyRepository, "findByIds")
      .mockImplementationOnce(async (ids) => {
        await db.playlists.update(playlistId, { name: "Renamed mid-flight" });
        return ok((await db.offlineCopies.bulkGet(ids)).filter(copy => copy !== undefined));
      });
    try {
      await deleteTrackAndSync(queryClient, { id: ytTrackId("v1") } as unknown as Track);
    }
    finally {
      spy.mockRestore();
    }

    const playlist = await db.playlists.get(playlistId);
    expect(playlist?.name).toBe("Renamed mid-flight");
    expect(playlist?.trackIds).toEqual([ytTrackId("v2")]);
  });

  it("deleteAlbumAndSync (remote): a rename racing the cascade survives", async () => {
    const album = await seedRemoteAlbum();

    const spy = vi.spyOn(offlineCopyRepository, "findByIds")
      .mockImplementationOnce(async (ids) => {
        await db.playlists.update(playlistId, { name: "Renamed mid-flight" });
        return ok((await db.offlineCopies.bulkGet(ids)).filter(copy => copy !== undefined));
      });
    try {
      await deleteAlbumAndSync(queryClient, album, { deleteTracks: true });
    }
    finally {
      spy.mockRestore();
    }

    const playlist = await db.playlists.get(playlistId);
    expect(playlist?.name).toBe("Renamed mid-flight");
    expect(playlist?.trackIds).toEqual([]);
  });

  it("deleteArtistAndSync: the committed cascade removes albums and detaches tracks", async () => {
    const artistId = ArtistId("a-1");
    const albumId = AlbumId("al-1");
    await db.artists.put({ id: artistId, name: "Local", pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.albums.put({ id: albumId, title: "Local Album", artistId, pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.tracks.put({
      id: TrackId("t-1"),
      title: "Local Track",
      artistIds: [artistId],
      artistName: "Local",
      albumId,
      albumTitle: "Local Album",
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "tracks/t1.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
    } as unknown as TrackEntity);

    await deleteArtistAndSync(queryClient, (await db.artists.get(artistId))!);

    expect(await db.artists.get(artistId)).toBeUndefined();
    expect(await db.albums.count()).toBe(0);
    const track = await db.tracks.get(TrackId("t-1"));
    expect(track?.artistIds).toEqual([]);
    expect(track?.albumTitle).toBeUndefined();
  });
});
