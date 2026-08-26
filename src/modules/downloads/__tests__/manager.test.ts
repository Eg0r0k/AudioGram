import "fake-indexeddb/auto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ResultAsync, okAsync } from "neverthrow";
import { ndTrackId } from "@/types/track-ref";
import type { SourceError } from "@/modules/sources/types";

const providerMock = vi.hoisted(() => ({
  downloadToFile: vi.fn(),
  cancelDownload: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
const fsMock = vi.hoisted(() => ({
  readDir: vi.fn(async () => [] as { name: string; isFile: boolean }[]),
  remove: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: true, IS_MOBILE: false, IS_WINDOWS: false }));
vi.mock("@/modules/sources", () => ({
  sources: { forTrack: () => providerMock },
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  readDir: fsMock.readDir,
  remove: fsMock.remove,
}));
vi.mock("vue-sonner", () => ({ toast: toastMock }));
// The real finalizer needs native storage — these tests cover the loop only.
vi.mock("../finalize", () => ({
  finalizeOfflineCopy: vi.fn(async () => {}),
}));

import { db } from "@/db";

type Manager = typeof import("../manager");

/** downloadToFile result the test resolves/rejects by hand. */
function deferredDownload() {
  let resolve!: (value: { path: string; format?: { codec?: string } }) => void;
  let reject!: (error: SourceError) => void;
  const promise = new Promise<{ path: string; format?: { codec?: string } }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {
    result: ResultAsync.fromPromise(promise, e => e as SourceError),
    resolve,
    reject,
  };
}

async function freshManager(): Promise<Manager> {
  vi.resetModules();
  return import("../manager");
}

describe("download manager", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    providerMock.downloadToFile.mockReset();
    providerMock.cancelDownload.mockReset();
    toastMock.error.mockReset();
    fsMock.readDir.mockReset().mockResolvedValue([]);
    fsMock.remove.mockReset().mockResolvedValue(undefined);
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs at most two downloads concurrently and deletes finished jobs", async () => {
    const downloads = [deferredDownload(), deferredDownload(), deferredDownload()];
    let next = 0;
    providerMock.downloadToFile.mockImplementation(() => downloads[next++].result);
    const manager = await freshManager();

    await manager.enqueueTrackDownload(ndTrackId("s1"));
    await manager.enqueueTrackDownload(ndTrackId("s2"));
    await manager.enqueueTrackDownload(ndTrackId("s3"));

    await vi.waitFor(() => expect(providerMock.downloadToFile).toHaveBeenCalledTimes(2));

    downloads[0].resolve({ path: "C:/tmp/s1.flac", format: { codec: "flac" } });
    await vi.waitFor(() => expect(providerMock.downloadToFile).toHaveBeenCalledTimes(3));

    downloads[1].resolve({ path: "C:/tmp/s2.flac" });
    downloads[2].resolve({ path: "C:/tmp/s3.flac" });
    // Done = deleted: offlineCopies is the ledger of finished downloads.
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });
  });

  it("dedupes an active track and skips tracks with an offline copy", async () => {
    providerMock.downloadToFile.mockImplementation(() => deferredDownload().result);
    const manager = await freshManager();

    const first = await manager.enqueueTrackDownload(ndTrackId("s1"));
    const second = await manager.enqueueTrackDownload(ndTrackId("s1"));
    expect(second).toBe(first);
    expect(await db.downloadJobs.count()).toBe(1);

    await db.offlineCopies.put({
      trackId: ndTrackId("copied"),
      storagePath: "offline/nd/copied.flac",
      sizeBytes: 1,
      format: {},
      downloadedAt: 0,
    });
    expect(await manager.enqueueTrackDownload(ndTrackId("copied"))).toBeNull();
  });

  it("requeues transient failures with backoff and retries", async () => {
    // Date must advance with the clock: the pump compares backoff deadlines
    // against Date.now().
    vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
    providerMock.downloadToFile
      .mockImplementationOnce(() => ResultAsync.fromPromise(
        Promise.reject({ kind: "NETWORK", message: "request failed: timeout" } satisfies SourceError),
        e => e as SourceError,
      ))
      .mockImplementationOnce(() => okAsync({ path: "C:/tmp/s1.flac" }));
    const manager = await freshManager();

    await manager.enqueueTrackDownload(ndTrackId("s1"));
    await vi.waitFor(async () => {
      const [job] = await db.downloadJobs.toArray();
      expect(job).toMatchObject({ status: "queued", attempts: 1, error: "request failed: timeout" });
    });
    expect(providerMock.downloadToFile).toHaveBeenCalledTimes(1);

    // The backoff timer registers in the pump that follows the failure —
    // wait for it before advancing the clock past the deadline.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });
    expect(providerMock.downloadToFile).toHaveBeenCalledTimes(2);
  });

  it("marks non-retriable failures as terminal errors", async () => {
    providerMock.downloadToFile.mockImplementation(() => ResultAsync.fromPromise(
      Promise.reject({ kind: "AUTH", message: "upstream status 401" } satisfies SourceError),
      e => e as SourceError,
    ));
    const manager = await freshManager();

    await manager.enqueueTrackDownload(ndTrackId("s1"));
    await vi.waitFor(async () => {
      const [job] = await db.downloadJobs.toArray();
      expect(job).toMatchObject({ status: "error", attempts: 1, error: "upstream status 401" });
    });
    expect(providerMock.downloadToFile).toHaveBeenCalledTimes(1);
    // The toast trails the row write (best-effort title lookup in between).
    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
  });

  it("a re-enqueue replaces the stale error job with a fresh queued one", async () => {
    await db.downloadJobs.put({
      id: "stale-error",
      trackId: ndTrackId("s1"),
      status: "error",
      attempts: 3,
      error: "upstream status 401",
      addedAt: 1,
    });
    providerMock.downloadToFile.mockImplementation(() => deferredDownload().result);
    const manager = await freshManager();

    const jobId = await manager.enqueueTrackDownload(ndTrackId("s1"));

    expect(jobId).not.toBe("stale-error");
    const jobs = await db.downloadJobs.toArray();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: jobId, attempts: 0 });
    expect(jobs[0].status).not.toBe("error");
  });

  it("cancelling a queued job removes it; a running one dies via the source flag", async () => {
    const running = deferredDownload();
    providerMock.downloadToFile.mockImplementation(() => running.result);
    providerMock.cancelDownload.mockImplementation(() => {
      running.reject({ kind: "CANCELLED", message: "cancelled" });
      return okAsync(undefined);
    });
    const manager = await freshManager();

    const runningId = await manager.enqueueTrackDownload(ndTrackId("s1"));
    await vi.waitFor(() => expect(providerMock.downloadToFile).toHaveBeenCalledTimes(1));

    // Second job never gets a slot slot-wise — it is queued (limit 2, but only
    // one provider call so far because the second stays pending too).
    const queuedId = await manager.enqueueTrackDownload(ndTrackId("s2"));
    await manager.cancelTrackDownload(queuedId!);
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.where("id").equals(queuedId!).count()).toBe(0);
    });

    await manager.cancelTrackDownload(runningId!);
    expect(providerMock.cancelDownload).toHaveBeenCalledWith(ndTrackId("s1"));
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.where("id").equals(runningId!).count()).toBe(0);
    });
  });

  it("init requeues jobs left running, sweeps temp orphans first and resumes", async () => {
    await db.downloadJobs.put({
      id: "job-1",
      trackId: ndTrackId("s1"),
      status: "running",
      attempts: 0,
      addedAt: 1,
    });
    fsMock.readDir.mockResolvedValue([{ name: "orphan.flac", isFile: true }]);
    const download = deferredDownload();
    providerMock.downloadToFile.mockImplementation(() => download.result);
    const manager = await freshManager();

    await manager.initDownloadManager();

    expect(fsMock.remove).toHaveBeenCalledWith("downloads-tmp/orphan.flac", expect.anything());
    await vi.waitFor(() => expect(providerMock.downloadToFile).toHaveBeenCalledWith(
      ndTrackId("s1"),
      expect.any(Function),
    ));
    download.resolve({ path: "C:/tmp/s1.flac" });
    await vi.waitFor(async () => {
      expect(await db.downloadJobs.get("job-1")).toBeUndefined();
    });
  });

  it("hands the finished file to the finalizer, then deletes the job", async () => {
    providerMock.downloadToFile.mockImplementation(() => okAsync({ path: "C:/tmp/s1.flac", format: { codec: "flac" } }));
    const manager = await freshManager();
    const finalize = vi.fn(async () => {});
    manager.setDownloadFinalizer(finalize);

    await manager.enqueueTrackDownload(ndTrackId("s1"));

    await vi.waitFor(async () => {
      expect(await db.downloadJobs.count()).toBe(0);
    });
    expect(finalize).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: ndTrackId("s1") }),
      { path: "C:/tmp/s1.flac", format: { codec: "flac" } },
    );
  });
});
