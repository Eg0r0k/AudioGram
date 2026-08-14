import pLimit from "p-limit";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import type { DownloadJobEntity } from "@/db/entities";
import { downloadJobRepository, offlineCopyRepository, trackRepository } from "@/db/repositories";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { getLogger } from "@/lib/logger";
import { sources } from "@/modules/sources";
import type { SourceError } from "@/modules/sources";
import { unwrapResult } from "@/queries/shared";
import type { TrackId } from "@/types/ids";
import { finalizeOfflineCopy } from "./finalize";
import { useDownloadsStore, type DownloadRuntime } from "./store/downloads.store";

//
// Download queue worker. Jobs persist in Dexie (downloadJobs) and survive
// restarts; runtime progress lives in the downloads store. The loop runs at
// most MAX_PARALLEL jobs, retries transient failures with backoff, and
// treats a cancel as "changed my mind" — the job disappears, no error row.
//

const MAX_PARALLEL = 2;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 5000;

const limit = pLimit(MAX_PARALLEL);
/** Job ids scheduled or running — the double-schedule guard between pumps. */
const inFlight = new Set<string>();
/** Backoff deadlines by job id (in-memory: a restart retries immediately). */
const retryAt = new Map<string, number>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

type DownloadFinalizer = (
  job: DownloadJobEntity,
  file: { path: string; format?: { codec?: string } },
) => Promise<void>;

/** Offline-copy import + cache sync; replaceable in unit tests. */
let finalizeDownload: DownloadFinalizer = finalizeOfflineCopy;

export function setDownloadFinalizer(finalizer: DownloadFinalizer): void {
  finalizeDownload = finalizer;
}

function runtimeOf(job: DownloadJobEntity): DownloadRuntime {
  return {
    jobId: job.id,
    trackId: job.trackId,
    batchId: job.batchId,
    status: "queued",
    downloaded: 0,
    total: null,
    cancelling: false,
  };
}

function isRetriable(error: SourceError): boolean {
  if (error.message === "cancelled") return false;
  return error.kind === "NETWORK" || error.kind === "UNKNOWN";
}

/**
 * Queues a download for the track. Returns the job id, reusing an active
 * job for the same track; null when an offline copy already exists.
 */
export async function enqueueTrackDownload(trackId: TrackId, batchId?: string): Promise<string | null> {
  const active = await unwrapResult(downloadJobRepository.findActiveByTrackId(trackId));
  if (active) return active.id;

  const copy = await unwrapResult(offlineCopyRepository.findById(trackId));
  if (copy) return null;

  // A terminal error from a previous run is superseded by this attempt.
  await unwrapResult(downloadJobRepository.deleteErrorsByTrackId(trackId));

  const job: DownloadJobEntity = {
    id: crypto.randomUUID(),
    trackId,
    status: "queued",
    attempts: 0,
    batchId,
    addedAt: Date.now(),
  };
  await unwrapResult(downloadJobRepository.upsert(job));
  const store = useDownloadsStore();
  store.upsert(runtimeOf(job));
  if (batchId) store.growBatch(batchId);
  void pump();
  return job.id;
}

/**
 * Cancel = "changed my mind": a queued job is removed outright; a running
 * one is flagged at the source — its downloadToFile fails with "cancelled"
 * and the failure handler removes the job (partial file dies in Rust).
 */
export async function cancelTrackDownload(jobId: string): Promise<void> {
  const job = await unwrapResult(downloadJobRepository.findById(jobId));
  if (!job) return;

  if (job.status === "running") {
    useDownloadsStore().markCancelling(jobId);
    const cancel = sources.forTrack(job.trackId).cancelDownload?.(job.trackId);
    if (cancel) {
      const result = await cancel;
      if (result.isErr()) {
        getLogger().warn(`[Downloads] Cancel failed for ${job.trackId}: ${result.error.message}`);
      }
    }
    return;
  }

  retryAt.delete(jobId);
  await unwrapResult(downloadJobRepository.delete(jobId));
  useDownloadsStore().remove(jobId);
  if (job.batchId) useDownloadsStore().shrinkBatch(job.batchId);
}

/**
 * Called once at startup: requeues jobs a dead session left running, sweeps
 * temp orphans BEFORE the first job can start (a sweep racing an active
 * download would eat its file), rehydrates the runtime store and pumps.
 */
export async function initDownloadManager(): Promise<void> {
  if (!IS_TAURI) return;

  await unwrapResult(downloadJobRepository.requeueRunning());
  await sweepTmpOrphans();

  const store = useDownloadsStore();
  const queued = await unwrapResult(downloadJobRepository.findByStatus("queued"));
  for (const job of queued) store.upsert(runtimeOf(job));

  void pump();
}

/**
 * Leftovers in downloads-tmp are downloads a previous session never
 * finished — recoverable garbage, deleted wholesale. Runs strictly before
 * the first job of this session starts.
 */
async function sweepTmpOrphans(): Promise<void> {
  try {
    const { BaseDirectory, readDir, remove } = await import("@tauri-apps/plugin-fs");
    const options = { baseDir: BaseDirectory.AppData };
    const entries = await readDir("downloads-tmp", options).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile) continue;
      await remove(`downloads-tmp/${entry.name}`, options).catch(() => {});
    }
  }
  catch (error) {
    getLogger().warn(`[Downloads] Temp sweep failed: ${String(error)}`);
  }
}

/** Schedules a pump for the earliest pending backoff deadline. */
function scheduleRetryPump(): void {
  const deadlines = [...retryAt.values()];
  if (deadlines.length === 0) return;
  const delay = Math.max(0, Math.min(...deadlines) - Date.now());
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void pump();
  }, delay);
}

async function pump(): Promise<void> {
  let queued: DownloadJobEntity[];
  try {
    queued = await unwrapResult(downloadJobRepository.findByStatus("queued"));
  }
  catch (error) {
    getLogger().error(`[Downloads] Failed to read the queue: ${String(error)}`);
    return;
  }

  const now = Date.now();
  for (const job of queued) {
    if (inFlight.has(job.id)) continue;
    const notBefore = retryAt.get(job.id);
    if (notBefore !== undefined && notBefore > now) continue;

    inFlight.add(job.id);
    limit(() => runJob(job.id))
      .finally(() => {
        inFlight.delete(job.id);
        void pump();
      })
      .catch(error => getLogger().error(`[Downloads] Job ${job.id} crashed: ${String(error)}`));
  }

  scheduleRetryPump();
}

async function runJob(jobId: string): Promise<void> {
  const store = useDownloadsStore();

  // The claim is the atomic queued → running transition; losing it means a
  // competing pump (or a cancel) got to the job first.
  const claimed = await unwrapResult(downloadJobRepository.claim(jobId));
  if (!claimed) return;
  const job = await unwrapResult(downloadJobRepository.findById(jobId));
  if (!job) return;

  retryAt.delete(jobId);
  // A cancel that raced the claim: the source was never invoked, so the
  // "cancelled" failure will not arrive — drop the job here.
  if (store.jobs[jobId]?.cancelling) {
    await unwrapResult(downloadJobRepository.delete(jobId));
    store.remove(jobId);
    if (job.batchId) store.shrinkBatch(job.batchId);
    return;
  }
  store.upsert({ ...runtimeOf(job), status: "running" });

  const result = await sources.forTrack(job.trackId).downloadToFile(job.trackId, (event) => {
    if (event.type === "progress") {
      store.setProgress(jobId, event.data.downloaded, event.data.total);
    }
  });

  if (result.isOk()) {
    try {
      await finalizeDownload(job, result.value);
    }
    catch (error) {
      getLogger().error(`[Downloads] Finalize failed for ${job.trackId}: ${String(error)}`);
      await failJob(job, { kind: "UNKNOWN", message: `finalize failed: ${String(error)}` });
      return;
    }
    // Done = deleted: offlineCopies is the ledger of finished downloads,
    // keeping a "done" row would only accumulate garbage.
    await unwrapResult(downloadJobRepository.delete(jobId));
    store.remove(jobId);
    if (job.batchId) store.bumpBatch(job.batchId, "finished");
    getLogger().info(`[Downloads] Done: ${job.trackId}`);
    return;
  }

  if (result.error.message === "cancelled") {
    await unwrapResult(downloadJobRepository.delete(jobId));
    store.remove(jobId);
    if (job.batchId) store.shrinkBatch(job.batchId);
    getLogger().info(`[Downloads] Cancelled: ${job.trackId}`);
    return;
  }

  await failJob(job, result.error);
}

async function failJob(job: DownloadJobEntity, error: SourceError): Promise<void> {
  const store = useDownloadsStore();
  const attempts = job.attempts + 1;

  if (isRetriable(error) && attempts < MAX_ATTEMPTS) {
    await unwrapResult(downloadJobRepository.upsert({
      ...job,
      status: "queued",
      attempts,
      error: error.message,
    }));
    retryAt.set(job.id, Date.now() + RETRY_BASE_MS * 2 ** (attempts - 1));
    store.upsert(runtimeOf({ ...job, attempts }));
    getLogger().warn(`[Downloads] Retry ${attempts}/${MAX_ATTEMPTS} for ${job.trackId}: ${error.message}`);
    return;
  }

  await unwrapResult(downloadJobRepository.upsert({
    ...job,
    status: "error",
    attempts,
    error: error.message,
  }));
  store.remove(job.id);
  if (job.batchId) store.bumpBatch(job.batchId, "failed");
  getLogger().error(`[Downloads] Failed ${job.trackId} (${error.kind}): ${error.message}`);
  await notifyTerminalFailure(job.trackId);
}

/** Terminal failure toast; the title lookup is best-effort decoration. */
async function notifyTerminalFailure(trackId: TrackId): Promise<void> {
  let title: string | undefined;
  try {
    title = (await unwrapResult(trackRepository.findById(trackId)))?.title;
  }
  catch {
    // The toast still fires, just without the track name.
  }
  toast.error(title
    ? i18n.global.t("downloads.failedTitled", { title })
    : i18n.global.t("downloads.failed"));
}
