import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { errAsync, okAsync } from "neverthrow";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import { PlaylistId } from "@/types/ids";
import type { SourceTrackDTO } from "@/modules/sources/types";

const providerMock = vi.hoisted(() => ({
  getAlbum: vi.fn(),
  getPlaylist: vi.fn(),
  downloadToFile: vi.fn(),
  cancelDownload: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true }));
vi.mock("@/modules/sources", () => ({
  sources: { get: () => providerMock, forTrack: () => providerMock },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  readDir: vi.fn(async () => []),
  remove: vi.fn(async () => {}),
}));
vi.mock("../finalize", () => ({
  finalizeOfflineCopy: vi.fn(async () => {}),
}));
vi.mock("@/queries/library.queries", () => ({
  invalidateLibraryData: vi.fn(async () => {}),
}));

import { db } from "@/db";
import { useDownloadsStore } from "../store/downloads.store";
import {
  enqueueLocalPlaylistDownload,
  enqueueNdAlbumDownload,
  enqueueNdPlaylistDownload,
} from "../enqueue";

function ndDto(rawId: string): SourceTrackDTO {
  return {
    id: ndTrackId(rawId),
    title: `Song ${rawId}`,
    albumTitle: "Remote Album",
    albumId: ndAlbumId("album1"),
    artistIds: [ndArtistId("artist1")],
    artistName: "Artist A",
  };
}

describe("batch downloads", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    providerMock.getAlbum.mockReset();
    providerMock.getPlaylist.mockReset();
    providerMock.downloadToFile.mockReset()
      .mockImplementation(() => okAsync({ path: "C:/tmp/x.flac", format: { codec: "flac" } }));
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("album batch pins every track, skips existing copies, aggregates progress", async () => {
    providerMock.getAlbum.mockReturnValue(okAsync({
      album: { id: ndAlbumId("album1"), title: "Remote Album" },
      tracks: [ndDto("s1"), ndDto("s2"), ndDto("copied")],
    }));
    await db.offlineCopies.put({
      trackId: ndTrackId("copied"),
      storagePath: "offline/nd/copied.flac",
      sizeBytes: 1,
      format: {},
      downloadedAt: 0,
    });

    const batchId = await enqueueNdAlbumDownload(ndAlbumId("album1"));

    expect(batchId).not.toBeNull();

    // Download = membership: the whole cascade is pinned at 1.
    expect((await db.tracks.get(ndTrackId("s1")))?.pinned).toBe(1);
    expect((await db.tracks.get(ndTrackId("copied")))?.pinned).toBe(1);
    expect((await db.albums.get(ndAlbumId("album1")))?.pinned).toBe(1);
    expect((await db.artists.get(ndArtistId("artist1")))?.pinned).toBe(1);

    const store = useDownloadsStore();
    expect(store.batches[batchId!]?.total).toBe(2);
    await vi.waitFor(() => {
      expect(store.batches[batchId!]).toMatchObject({ total: 2, finished: 2, failed: 0 });
    });
  });

  it("failed jobs count into the batch as failures", async () => {
    providerMock.getPlaylist.mockReturnValue(okAsync({
      playlist: { id: "pl1", name: "Mix", trackCount: 1 },
      tracks: [ndDto("s9")],
    }));
    providerMock.downloadToFile.mockImplementation(() => errAsync({ kind: "AUTH", message: "upstream status 401" }));

    const batchId = await enqueueNdPlaylistDownload("pl1");

    const store = useDownloadsStore();
    await vi.waitFor(() => {
      expect(store.batches[batchId!]).toMatchObject({ total: 1, finished: 0, failed: 1 });
    });
  });

  it("local playlist batch takes only ND tracks and promotes shadows", async () => {
    // A mixed local playlist: one local track, one ND shadow row.
    await db.tracks.bulkPut([
      {
        id: "local-1", title: "Local", artistIds: [], albumId: "al-local", tagIds: [],
        source: 0, storagePath: "tracks/local-1.mp3", pinned: 1, state: 1,
        duration: 100, format: {}, addedAt: 1, playCount: 0, isLiked: false,
      },
      {
        id: ndTrackId("shadow"), title: "Shadow", artistIds: [ndArtistId("artist1")],
        albumId: ndAlbumId("album1"), tagIds: [], source: 3, storagePath: "",
        pinned: 0, state: 1, duration: 100, format: {}, addedAt: 1, playCount: 0, isLiked: false,
      },
    ] as never[]);
    await db.albums.put({ id: ndAlbumId("album1"), title: "Remote Album", artistId: ndArtistId("artist1"), pinned: 0 } as never);
    await db.artists.put({ id: ndArtistId("artist1"), name: "Artist A", pinned: 0 } as never);
    await db.playlists.put({
      id: PlaylistId("pl-local"), name: "Mixed", trackIds: ["local-1", ndTrackId("shadow")],
      createdAt: 1, updatedAt: 1,
    } as never);

    const batchId = await enqueueLocalPlaylistDownload(PlaylistId("pl-local"));

    const jobs = await db.downloadJobs.where("batchId").equals(batchId!).toArray();
    expect(jobs.map(job => job.trackId)).toEqual([ndTrackId("shadow")]);
    expect((await db.tracks.get(ndTrackId("shadow")))?.pinned).toBe(1);

    const store = useDownloadsStore();
    expect(store.batches[batchId!]?.total).toBe(1);
  });

  it("returns null when nothing needs downloading", async () => {
    providerMock.getAlbum.mockReturnValue(okAsync({
      album: { id: ndAlbumId("album1"), title: "Remote Album" },
      tracks: [],
    }));
    expect(await enqueueNdAlbumDownload(ndAlbumId("album1"))).toBeNull();
  });
});
