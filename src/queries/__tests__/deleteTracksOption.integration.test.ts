import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, ArtistEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

//
// The "also delete the tracks inside" opt-in. Without it album/artist/playlist
// deletion leaves the tracks in the library (ungrouped, detached, unreferenced);
// with it the tracks, their offline copies, files and playlist references go
// too, and GC takes whatever that empties.
//

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
  buildArtistDoc: vi.fn(() => ({})),
  buildPlaylistDoc: vi.fn(() => ({})),
  buildTrackDocFromDb: vi.fn(async () => ({})),
}));

import { db } from "@/db";
import { deleteAlbumAndSync } from "../album.queries";
import { deleteArtistAndSync } from "../artist.queries";
import { deletePlaylistAndSync } from "../playlist.queries";

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

const seedLibrary = async () => {
  await db.artists.put(artist);
  await db.albums.put(album);
  await db.tracks.bulkPut([localTrack("t-1", "One"), localTrack("t-2", "Two")]);
  await db.offlineCopies.put({
    trackId: TrackId("t-1"),
    storagePath: "offline/t-1.m4a",
    sizeBytes: 1,
    format: {},
    downloadedAt: 1,
  } as never);
};

describe("deleteTracks option (integration)", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.clearAllMocks();
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("a local album takes its tracks, copies and files, and GC takes the artist", async () => {
    await seedLibrary();
    await db.playlists.put({
      id: playlistId,
      name: "Mix",
      trackIds: [TrackId("t-1")],
      addedAt: 1,
      updatedAt: 1,
    } satisfies PlaylistEntity);

    await deleteAlbumAndSync(queryClient, album, { deleteTracks: true });

    expect(await db.tracks.count()).toBe(0);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
    expect((await db.playlists.get(playlistId))?.trackIds).toEqual([]);
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/t-1.m4a");
  });

  it("a local album without the opt-in still only ungroups its tracks", async () => {
    await seedLibrary();

    await deleteAlbumAndSync(queryClient, album, { deleteTracks: false });

    expect(await db.tracks.count()).toBe(2);
    expect(await db.offlineCopies.count()).toBe(1);
    expect(await db.artists.count()).toBe(1);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });

  it("an artist takes their albums and tracks", async () => {
    await seedLibrary();

    await deleteArtistAndSync(queryClient, artist, { deleteTracks: true });

    expect(await db.tracks.count()).toBe(0);
    expect(await db.offlineCopies.count()).toBe(0);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/t-1.m4a");
  });

  it("an artist without the opt-in keeps the tracks and detaches them", async () => {
    await seedLibrary();

    await deleteArtistAndSync(queryClient, artist, { deleteTracks: false });

    const tracks = await db.tracks.toArray();
    expect(tracks).toHaveLength(2);
    expect(tracks.every(track => track.artistIds.length === 0)).toBe(true);
    expect(tracks.every(track => track.albumTitle === "")).toBe(true);
    expect(await db.albums.count()).toBe(0);
    expect(await db.artists.count()).toBe(0);
  });

  it("a playlist takes its tracks out of the library, another playlist loses them too", async () => {
    await seedLibrary();
    const otherId = PlaylistId("pl-2");
    await db.playlists.bulkPut([
      { id: playlistId, name: "Mix", trackIds: [TrackId("t-1")], addedAt: 1, updatedAt: 1 },
      { id: otherId, name: "Other", trackIds: [TrackId("t-1"), TrackId("t-2")], addedAt: 1, updatedAt: 1 },
    ] satisfies PlaylistEntity[]);

    await deletePlaylistAndSync(
      queryClient,
      (await db.playlists.get(playlistId))!,
      { deleteTracks: true },
    );

    expect(await db.playlists.get(playlistId)).toBeUndefined();
    // Only the deleted playlist's own track goes — t-2 was never in it.
    expect(await db.tracks.get(TrackId("t-1"))).toBeUndefined();
    expect(await db.tracks.get(TrackId("t-2"))).toBeDefined();
    expect((await db.playlists.get(otherId))?.trackIds).toEqual([TrackId("t-2")]);
    expect(storageMock.deleteFile).toHaveBeenCalledWith("offline/t-1.m4a");
  });

  it("a playlist without the opt-in leaves every track in the library", async () => {
    await seedLibrary();
    await db.playlists.put({
      id: playlistId,
      name: "Mix",
      trackIds: [TrackId("t-1"), TrackId("t-2")],
      addedAt: 1,
      updatedAt: 1,
    } satisfies PlaylistEntity);

    await deletePlaylistAndSync(queryClient, (await db.playlists.get(playlistId))!);

    expect(await db.playlists.count()).toBe(0);
    expect(await db.tracks.count()).toBe(2);
    expect(storageMock.deleteFile).not.toHaveBeenCalled();
  });
});
