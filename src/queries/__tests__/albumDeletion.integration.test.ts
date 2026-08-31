import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";

//
// Deleting an album with `deleteTracks` cascades: its tracks, their offline
// copies and files go with it, GC drops the orphaned artist. Without the flag
// the album only ungroups — its tracks stay, downloads intact, but must not be
// left with a dangling albumId.
//

const storageMock = vi.hoisted(() => ({
  deleteFile: vi.fn(),
}));

vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/service/searchIndex", () => ({
  removeSearchDocuments: vi.fn(async () => {}),
  upsertSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/service/buildDocuments", () => ({
  buildAlbumDocFromDb: vi.fn(async () => ({})),
  buildTrackDocFromDb: vi.fn(async () => ({})),
}));

import { db } from "@/db";
import { deleteAlbumAndSync } from "../album.queries";
import { deleteTrackAndSync } from "../track.queries";
import type { Track } from "@/modules/player/types";

const ytArtist = ytArtistId("UC1");
const ytAlbum = ytAlbumId("MPREb1");

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

describe("deleteAlbumAndSync cascade (integration)", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("deletes a remote album with its tracks, copies and files; GC takes the artist", async () => {
    await db.artists.put({ id: ytArtist, name: "Shadow Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
    const album: AlbumEntity = { id: ytAlbum, title: "Shadow Album", artistId: ytArtist, pinned: 1, addedAt: 1, updatedAt: 1 };
    await db.albums.put(album);
    await db.tracks.bulkPut([ytTrack("v1", "One"), ytTrack("v2", "Two")]);
    await db.offlineCopies.bulkPut([
      { trackId: ytTrackId("v1"), storagePath: "offline/yt/v1.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 },
      { trackId: ytTrackId("v2"), storagePath: "offline/yt/v2.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 },
    ]);

    await deleteAlbumAndSync(queryClient, album, { deleteTracks: true });

    expect(await db.tracks.count()).toBe(0);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
    const deletedPaths = storageMock.deleteFile.mock.calls.map(call => call[0]).sort();
    expect(deletedPaths).toEqual(["offline/yt/v1.m4a", "offline/yt/v2.m4a"]);
  });

  it("ungroups a remote album without the flag, keeping its tracks and downloads", async () => {
    await db.artists.put({ id: ytArtist, name: "Shadow Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
    const album: AlbumEntity = { id: ytAlbum, title: "Shadow Album", artistId: ytArtist, pinned: 1, addedAt: 1, updatedAt: 1 };
    await db.albums.put(album);
    await db.tracks.put(ytTrack("v1", "One"));
    await db.offlineCopies.put({ trackId: ytTrackId("v1"), storagePath: "offline/yt/v1.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 });

    await deleteAlbumAndSync(queryClient, album);

    const track = await db.tracks.get(ytTrackId("v1"));
    expect(track?.albumId).toBe("");
    expect(track?.albumTitle).toBe("");
    expect(await db.offlineCopies.count()).toBe(1);
    expect(await db.albums.count()).toBe(0);
    // The tracks still credit them, so the artist is not orphaned.
    expect(await db.artists.count()).toBe(1);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  it("keeps local tracks but detaches them without a dangling albumId", async () => {
    const artistId = ArtistId("a-1");
    const albumId = AlbumId("al-1");
    await db.artists.put({ id: artistId, name: "Local", addedAt: 1, updatedAt: 1 });
    const album: AlbumEntity = { id: albumId, title: "Local Album", artistId, addedAt: 1, updatedAt: 1 };
    await db.albums.put(album);
    await db.tracks.put({
      id: TrackId("t-1"),
      title: "Local Track",
      artistIds: [artistId],
      albumId,
      tagIds: [],
      source: TrackSource.LOCAL,
      state: TrackState.READY,
      storagePath: "tracks/t1.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
      albumTitle: "Local Album",
    } as unknown as TrackEntity);

    await deleteAlbumAndSync(queryClient, album);

    const track = await db.tracks.get(TrackId("t-1"));
    expect(track).toBeDefined();
    expect(track?.albumTitle).toBe("");
    expect(track?.albumId).toBe("");
    expect(await db.albums.count()).toBe(0);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  it("deleting a single downloaded track also removes its offline copy", async () => {
    await db.artists.put({ id: ytArtist, name: "Shadow Artist", pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.albums.put({ id: ytAlbum, title: "Shadow Album", artistId: ytArtist, pinned: 1, addedAt: 1, updatedAt: 1 });
    await db.tracks.put(ytTrack("v1", "One"));
    await db.offlineCopies.put({ trackId: ytTrackId("v1"), storagePath: "offline/yt/v1.m4a", sizeBytes: 1, format: {}, downloadedAt: 1 });

    await deleteTrackAndSync(queryClient, { id: ytTrackId("v1") } as unknown as Track);

    expect(await db.tracks.count()).toBe(0);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/yt/v1.m4a");
  });
});
