import MetaWorker from "@/workers/meta.worker?worker";
import type { BaseMetadata, ParseRequest, ParseResponse } from "@/workers/types";
import { getLogger } from "@/lib/logger";
import { ImportError } from "./types";

const WORKER_TIMEOUT = 30_000; // 30 sec
const WORKER_POOL_SIZE = 4;
/**
 * How long a fully idle pool keeps its workers before tearing them down.
 * Imports are rare bursts; between them the workers (each a thread with the
 * parser bundle loaded) would otherwise sit on memory for the app's lifetime.
 */
const WORKER_IDLE_SHUTDOWN = 30_000;

interface QueuedJob {
  fileName: string;
  data: Uint8Array;
  extractCover: boolean;
  resolve: (meta: BaseMetadata) => void;
  reject: (error: Error) => void;
}

interface PendingRequest {
  fileName: string;
  resolve: (meta: BaseMetadata) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  entry: WorkerEntry;
}

interface WorkerEntry {
  worker: Worker;
  busy: boolean;
}

/**
 * Lazily grown pool of metadata workers, capped at {@link WORKER_POOL_SIZE}.
 *
 * Workers spawn on demand — one per queued job up to the cap — and a fully
 * idle pool tears them down after {@link WORKER_IDLE_SHUTDOWN}, so no worker
 * exists outside an active import. Callers may submit far more parses than
 * the cap; the surplus waits in {@link queue} and is handed to whichever
 * worker frees up first.
 */
export class WorkerPool {
  private readonly entries: WorkerEntry[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queue: QueuedJob[] = [];
  private disposed = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly maxSize = WORKER_POOL_SIZE) {}

  parse(fileName: string, data: Uint8Array, options?: { extractCover?: boolean }): Promise<BaseMetadata> {
    if (this.disposed) {
      return Promise.reject(new Error("WorkerPool is disposed"));
    }

    this.clearIdleTimer();
    return new Promise<BaseMetadata>((resolve, reject) => {
      this.queue.push({
        fileName,
        data,
        extractCover: options?.extractCover ?? true,
        resolve,
        reject,
      });
      this.pump();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.clearIdleTimer();

    for (const job of this.queue.splice(0)) {
      job.reject(new Error("WorkerPool disposed"));
    }

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("WorkerPool disposed"));
      this.pending.delete(id);
    }

    for (const entry of this.entries) {
      entry.worker.terminate();
    }
    this.entries.length = 0;
  }

  private spawn(): WorkerEntry {
    const worker = new MetaWorker();
    worker.addEventListener("message", this.onMessage);
    return { worker, busy: false };
  }

  /** Feeds queued jobs to idle workers, spawning up to the cap on demand. */
  private pump(): void {
    while (this.queue.length > 0) {
      let entry = this.entries.find(e => !e.busy);
      if (!entry) {
        if (this.entries.length >= this.maxSize) return;
        entry = this.spawn();
        this.entries.push(entry);
      }
      this.dispatch(entry, this.queue.shift()!);
    }
  }

  private dispatch(entry: WorkerEntry, job: QueuedJob): void {
    const id = crypto.randomUUID();
    entry.busy = true;

    // Started here rather than on submit, so queue wait never eats the budget.
    const timeoutId = setTimeout(() => {
      this.pending.delete(id);
      // A worker that blew the budget is presumed wedged — retire it instead
      // of handing it more work behind whatever it is still chewing on.
      getLogger().warn(`[WorkerPool] ${job.fileName}: parse timed out after ${WORKER_TIMEOUT / 1000}s — retiring worker`);
      this.retire(entry);
      job.reject(ImportError.workerTimeout(job.fileName));
    }, WORKER_TIMEOUT);

    this.pending.set(id, {
      fileName: job.fileName,
      resolve: job.resolve,
      reject: job.reject,
      timeoutId,
      entry,
    });

    const request: ParseRequest = {
      fileId: id,
      fileData: job.data,
      fileName: job.fileName,
      extractCover: job.extractCover,
    };

    try {
      entry.worker.postMessage(request, [job.data.buffer]);
    }
    catch (e) {
      // A worker that never received its job will never answer; failing to
      // release it here would silently shrink the pool.
      clearTimeout(timeoutId);
      this.pending.delete(id);
      this.release(entry);
      job.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }

  private release(entry: WorkerEntry): void {
    entry.busy = false;
    if (this.disposed) return;
    this.pump();
    this.maybeScheduleIdleShutdown();
  }

  /** Drops a wedged worker; pump() respawns one only when queued work needs it. */
  private retire(entry: WorkerEntry): void {
    if (this.disposed) return;

    const index = this.entries.indexOf(entry);
    if (index === -1) return;

    entry.worker.terminate();
    this.entries.splice(index, 1);
    this.pump();
    this.maybeScheduleIdleShutdown();
  }

  private maybeScheduleIdleShutdown(): void {
    if (this.pending.size > 0 || this.queue.length > 0 || this.entries.length === 0) return;

    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.pending.size > 0 || this.queue.length > 0) return;
      for (const entry of this.entries.splice(0)) {
        entry.worker.terminate();
      }
    }, WORKER_IDLE_SHUTDOWN);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private onMessage = (e: MessageEvent<ParseResponse>): void => {
    const pending = this.pending.get(e.data.fileId);

    // Unknown id — a late answer from a request that already timed out.
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pending.delete(e.data.fileId);
    this.release(pending.entry);

    if (e.data.success) {
      pending.resolve(e.data.meta);
    }
    else {
      pending.reject(new Error(e.data.error ?? "Worker parse error"));
    }
  };
}
