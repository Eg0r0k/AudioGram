import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, ArtistEntity, CoverEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

const storageMock = vi.hoisted(() => ({ deleteFile: vi.fn() }));
const searchMock = vi.hoisted(() => ({
  removeSearchDocuments: vi.fn(async () => {}),
  indexImportedTracks: vi.fn(async () => {}),
}));

vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/service/searchIndex", () => ({
  removeSearchDocuments: searchMock.removeSearchDocuments,
  indexImportedTracks: searchMock.indexImportedTracks,
  upsertSearchDocuments: vi.fn(async () => {}),
  searchTracks: vi.fn(),
  searchDocuments: vi.fn(),
}));
vi.mock("@/modules/search/service/buildDocuments", () => ({
  buildAlbumDocFromDb: vi.fn(async () => ({})),
  buildArtistDoc: vi.fn(() => ({})),
  buildPlaylistDoc: vi.fn(() => ({})),
  buildTrackDocFromDb: vi.fn(async () => ({})),
}));

import { db } from "@/db";
import { coverCache } from "@/modules/covers/lib/cover-cache";
import { deleteTracksWithUndo } from "../track-undo";
import { queryKeys } from "../query-keys";

const artistId = ArtistId("a-1");
const albumId = AlbumId("al-1");
const playlistId = PlaylistId("pl-1");

const artist: ArtistEntity = { id: artistId, name: "Local", pinned: 1, addedAt: 1, updatedAt: 1 } as ArtistEntity;
const album: AlbumEntity = { id: albumId, title: "Local Album", artistId, pinned: 1, addedAt: 1, updatedAt: 1 } as AlbumEntity;

const localTrack = (id: string, title: string): TrackEntity => ({
  id: TrackId(id),
  title,
  artistIds: [artistId],
  albumId,
  tagIds: [],
  source: TrackSource.LOCAL,
  state: TrackState.READY,
  storagePath: `tracks/${id}.mp3`,
  duration: 100,
  format: {},
  playCount: 0,
  pinned: 1,
  addedAt: 1,
  albumTitle: "Local Album",
  artistName: "Local",
} as unknown as TrackEntity);

const cover = (id: string, ownerType: CoverEntity["ownerType"], ownerId: string): CoverEntity => ({
  id,
  ownerType,
  ownerId,
  blob: new Blob(["x"]),
  mimeType: "image/png",
  addedAt: 1,
  updatedAt: 1,
});

const ids = (rows: { id: string }[]) => rows.map(row => row.id).sort();

describe("deleteTracksWithUndo (integration)", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    await db.artists.put(artist);
    await db.albums.put(album);
    await db.tracks.bulkPut([localTrack("t-1", "One"), localTrack("t-2", "Two"), localTrack("t-3", "Three")]);
    await db.offlineCopies.put({
      trackId: TrackId("t-1"),
      storagePath: "offline/t-1.m4a",
      sizeBytes: 1,
      format: {},
      downloadedAt: 1,
    } as never);
    await db.covers.bulkPut([
      cover("c-t1", "track", "t-1"),
      cover("c-al1", "album", albumId),
      cover("c-a1", "artist", artistId),
    ]);
    await db.playlists.put({
      id: playlistId,
      name: "Mix",
      trackIds: [TrackId("t-1"), TrackId("t-3"), TrackId("t-2")],
      addedAt: 1,
      updatedAt: 1,
    } satisfies PlaylistEntity);
  });

  it("deletes like the plain cascade but keeps the copy files until finalize", async () => {
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1"), TrackId("t-2")]);

    expect(undo.deleted).toBe(2);
    expect(ids(await db.tracks.toArray())).toEqual(["t-3"]);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(ids(await db.covers.toArray())).toEqual(["c-a1", "c-al1"]);
    expect((await db.playlists.get(playlistId))?.trackIds).toEqual([TrackId("t-3")]);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();

    await undo.finalize();
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/t-1.m4a");
  });

  it("restore brings back rows, covers, copies and the playlist order, never touching files", async () => {
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1"), TrackId("t-2")]);

    await undo.restore();

    expect(ids(await db.tracks.toArray())).toEqual(["t-1", "t-2", "t-3"]);
    expect(await db.offlineCopies.get(TrackId("t-1"))).toMatchObject({ storagePath: "offline/t-1.m4a" });
    expect(ids(await db.covers.toArray())).toEqual(["c-a1", "c-al1", "c-t1"]);
    expect((await db.playlists.get(playlistId))?.trackIds).toEqual([TrackId("t-1"), TrackId("t-3"), TrackId("t-2")]);
    expect(searchMock.indexImportedTracks).toHaveBeenCalledWith([TrackId("t-1"), TrackId("t-2")]);

    await undo.finalize();
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  // The delete parks every copy's cache entry on null (the row is gone); a
  // restore that only puts the rows back leaves the download button lit.
  it("restore puts the offline copies back into the query cache", async () => {
    const key = queryKeys.offlineCopies.detail(TrackId("t-1"));
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1"), TrackId("t-2")]);
    expect(queryClient.getQueryData(key)).toBeNull();

    await undo.restore();

    expect(queryClient.getQueryData(key)).toMatchObject({ storagePath: "offline/t-1.m4a" });
  });

  it("restores the album and artist the cascade took along with their covers", async () => {
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1"), TrackId("t-2"), TrackId("t-3")]);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
    // The cascade drops track and album covers; artist covers it leaves behind.
    expect(ids(await db.covers.toArray())).toEqual(["c-a1"]);

    await undo.restore();

    expect(await db.albums.get(albumId)).toMatchObject({ title: "Local Album", pinned: 1 });
    expect(await db.artists.get(artistId)).toMatchObject({ name: "Local", pinned: 1 });
    expect(ids(await db.covers.toArray())).toEqual(["c-a1", "c-al1", "c-t1"]);
    expect(await db.tracks.count()).toBe(3);
  });

  it("restore re-reads only the restored covers instead of the whole cache", async () => {
    const invalidateAll = vi.spyOn(coverCache, "invalidateAll");
    const invalidate = vi.spyOn(coverCache, "invalidate");
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1"), TrackId("t-2"), TrackId("t-3")]);
    invalidate.mockClear();

    await undo.restore();

    expect(invalidateAll).not.toHaveBeenCalled();
    const owners = invalidate.mock.calls.map(([owner]) => `${owner.ownerType}:${owner.ownerId}`);
    expect(owners).toEqual(expect.arrayContaining(["track:t-1", "album:al-1", "artist:a-1"]));
  });

  it("leaves an album that still has tracks alone on restore", async () => {
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("t-1")]);
    await db.albums.update(albumId, { title: "Renamed meanwhile" });

    await undo.restore();

    expect((await db.albums.get(albumId))?.title).toBe("Renamed meanwhile");
  });

  it("restore after finalize and finalize after restore are no-ops", async () => {
    const first = await deleteTracksWithUndo(queryClient, [TrackId("t-1")]);
    await first.finalize();
    await first.restore();
    expect(ids(await db.tracks.toArray())).toEqual(["t-2", "t-3"]);

    const second = await deleteTracksWithUndo(queryClient, [TrackId("t-2")]);
    await second.restore();
    storageMock.deleteFile.mockClear();
    await second.finalize();
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  it("reports 0 and inert callbacks for unknown ids", async () => {
    const undo = await deleteTracksWithUndo(queryClient, [TrackId("nope")]);
    expect(undo.deleted).toBe(0);
    await undo.restore();
    await undo.finalize();
    expect(await db.tracks.count()).toBe(3);
  });
});
