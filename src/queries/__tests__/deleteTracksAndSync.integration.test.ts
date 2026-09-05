import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, ArtistEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

const storageMock = vi.hoisted(() => ({ deleteFile: vi.fn() }));
const searchMock = vi.hoisted(() => ({ removeSearchDocuments: vi.fn(async () => {}) }));

vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/service/searchIndex", () => ({
  removeSearchDocuments: searchMock.removeSearchDocuments,
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
import * as cache from "../cache";
import { deleteTracksAndSync } from "../track.queries";

const artistId = ArtistId("a-1");
const albumId = AlbumId("al-1");
const playlistId = PlaylistId("pl-1");

const artist: ArtistEntity = { id: artistId, name: "Local", addedAt: 1, updatedAt: 1 } as ArtistEntity;
const album: AlbumEntity = { id: albumId, title: "Local Album", artistId, addedAt: 1, updatedAt: 1 } as AlbumEntity;

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
  addedAt: 1,
  albumTitle: "Local Album",
  artistName: "Local",
} as unknown as TrackEntity);

describe("deleteTracksAndSync (integration)", () => {
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
    await db.playlists.put({
      id: playlistId,
      name: "Mix",
      trackIds: [TrackId("t-1"), TrackId("t-3")],
      addedAt: 1,
      updatedAt: 1,
    } satisfies PlaylistEntity);
  });

  it("removes rows, copies, files and playlist refs for all ids, keeps the rest", async () => {
    const deleted = await deleteTracksAndSync(queryClient, [TrackId("t-1"), TrackId("t-2")]);

    expect(deleted).toBe(2);
    expect((await db.tracks.toArray()).map(t => t.id)).toEqual([TrackId("t-3")]);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/t-1.m4a");
    expect((await db.playlists.get(playlistId))?.trackIds).toEqual([TrackId("t-3")]);
    expect(await db.albums.count()).toBe(1);
    expect(await db.artists.count()).toBe(1);
  });

  it("syncs the search index and invalidates once with every affected album and artist", async () => {
    const invalidate = vi.spyOn(cache, "invalidateForTrackMutation");

    await deleteTracksAndSync(queryClient, [TrackId("t-1"), TrackId("t-2")]);

    expect(searchMock.removeSearchDocuments).toHaveBeenCalledTimes(1);
    expect(searchMock.removeSearchDocuments).toHaveBeenCalledWith(["track:t-1", "track:t-2"]);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][1]).toEqual({
      kind: "removal",
      albumIds: [albumId],
      artistIds: [artistId],
      playlistIds: [playlistId],
    });
  });

  it("GC takes the album and artist when their last tracks go", async () => {
    await deleteTracksAndSync(queryClient, [TrackId("t-1"), TrackId("t-2"), TrackId("t-3")]);

    expect(await db.tracks.count()).toBe(0);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
  });

  it("ignores unknown ids and returns 0 for an empty list", async () => {
    expect(await deleteTracksAndSync(queryClient, [])).toBe(0);
    expect(await deleteTracksAndSync(queryClient, [TrackId("nope")])).toBe(0);
    expect(await db.tracks.count()).toBe(3);
  });
});
