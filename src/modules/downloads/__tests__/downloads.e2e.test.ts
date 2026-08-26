import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { okAsync, ResultAsync } from "neverthrow";
import { ndAlbumId, ndArtistId, ndTrackId, ytTrackId } from "@/types/track-ref";
import type { SourceError, SourceTrackDTO } from "@/modules/sources/types";

//
// End-to-end (step 10): a whole album batch runs through the REAL finalizer
// into offline copies, and the persisted queue resumes after the manager
// module (worker state, p-limit, retry map) is recreated from scratch.
//

const storageMock = vi.hoisted(() => ({
  importFile: vi.fn(),
  getFileSize: vi.fn(),
  deleteFile: vi.fn(),
  getAudioUrl: vi.fn(),
}));
const fsMock = vi.hoisted(() => ({
  readDir: vi.fn(async () => []),
  remove: vi.fn(async () => {}),
}));
const providerMock = vi.hoisted(() => ({
  getAlbum: vi.fn(),
  downloadToFile: vi.fn(),
  cancelDownload: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true, IS_MOBILE: false, IS_WINDOWS: false }));
vi.mock("@/db/storage", () => ({ storageService: storageMock }));
vi.mock("@/modules/sources", () => ({
  sources: { get: () => providerMock, forTrack: () => providerMock },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  readDir: fsMock.readDir,
  remove: fsMock.remove,
}));
vi.mock("@/queries/library.queries", () => ({
  invalidateLibraryData: vi.fn(async () => {}),
}));

import { db } from "@/db";

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

describe("downloads end-to-end", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // hasNativeSupport checks for importFile — the mock's shape passes.
    storageMock.importFile.mockImplementation((_src: string, target: string) => okAsync(target));
    storageMock.getFileSize.mockReturnValue(okAsync(2048));
    storageMock.deleteFile.mockReturnValue(okAsync(undefined));
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  it("downloads a whole album into offline copies through the real finalizer", async () => {
    const rawIds = ["s1", "s2", "s3"];
    providerMock.getAlbum.mockReturnValue(okAsync({
      album: { id: ndAlbumId("album1"), title: "Remote Album" },
      tracks: rawIds.map(ndDto),
    }));
    providerMock.downloadToFile.mockImplementation((trackId: string) =>
      okAsync({ path: `C:/tmp/downloads-tmp/${trackId.slice("nd:".length)}.flac`, format: { codec: "flac" } }));

    vi.resetModules();
    const { enqueueNdAlbumDownload } = await import("../enqueue");
    const { useDownloadsStore } = await import("../store/downloads.store");

    const batchId = await enqueueNdAlbumDownload(ndAlbumId("album1"));

    // Finished jobs are deleted; offlineCopies below is the ledger.
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });

    for (const rawId of rawIds) {
      expect(await db.offlineCopies.get(ndTrackId(rawId))).toMatchObject({
        storagePath: `offline/nd/${rawId}.flac`,
        sizeBytes: 2048,
        format: { codec: "flac" },
      });
      expect((await db.tracks.get(ndTrackId(rawId)))?.pinned).toBe(1);
    }
    expect(useDownloadsStore().batches[batchId!]).toMatchObject({ total: 3, finished: 3, failed: 0 });
  });

  it("downloads a single YT track through the shared manager (M5)", async () => {
    providerMock.downloadToFile.mockImplementation((trackId: string) =>
      okAsync({ path: `C:/yt-cache/${trackId.slice("yt:".length)}.m4a` }));

    vi.resetModules();
    const { downloadSubject } = await import("../enqueue");

    const dto: SourceTrackDTO = {
      id: ytTrackId("dQw4w9WgXcQ"),
      title: "Never Gonna Give You Up",
      artistName: "Rick Astley",
    };
    const jobId = await downloadSubject({ kind: "remote", dto });
    expect(jobId).not.toBeNull();

    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });

    expect(await db.offlineCopies.get(ytTrackId("dQw4w9WgXcQ"))).toMatchObject({
      storagePath: "offline/yt/dQw4w9WgXcQ.m4a",
    });
    // Download = library membership: a pinned yt shadow row exists.
    expect((await db.tracks.get(ytTrackId("dQw4w9WgXcQ")))?.pinned).toBe(1);
    // The finalizer cleans the source temp file once the copy landed.
    expect(fsMock.remove).toHaveBeenCalledWith("C:/yt-cache/dQw4w9WgXcQ.m4a");
  });

  it("resumes the persisted queue after the manager is recreated", async () => {
    // First life: downloads hang forever — two claim slots, one stays queued.
    providerMock.downloadToFile.mockImplementation(() =>
      ResultAsync.fromPromise(new Promise(() => {}), e => e as SourceError));

    vi.resetModules();
    const first = await import("../manager");
    await first.enqueueTrackDownload(ndTrackId("s1"));
    await first.enqueueTrackDownload(ndTrackId("s2"));
    await first.enqueueTrackDownload(ndTrackId("s3"));

    await vi.waitFor(async () => {
      const jobs = await db.downloadJobs.toArray();
      expect(jobs.filter(job => job.status === "running")).toHaveLength(2);
      expect(jobs.filter(job => job.status === "queued")).toHaveLength(1);
    });

    // Second life (app restart): fresh module state, downloads now succeed.
    providerMock.downloadToFile.mockImplementation((trackId: string) =>
      okAsync({ path: `C:/tmp/downloads-tmp/${trackId.slice("nd:".length)}.flac`, format: { codec: "flac" } }));
    vi.resetModules();
    const second = await import("../manager");
    await second.initDownloadManager();

    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });
    expect(await db.offlineCopies.count()).toBe(3);
  });
});
