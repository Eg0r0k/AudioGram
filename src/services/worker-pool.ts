import MetaWorker from "@/workers/meta.worker?worker";
import type { BaseMetadata, ParseRequest, ParseResponse } from "@/workers/types";
import { ImportError } from "./types";

const WORKER_TIMEOUT = 30_000; // 30 sec
const WORKER_POOL_SIZE = 4;

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
 * Fixed-size pool of metadata workers.
 *
 * Callers may submit far more parses than there are workers; the surplus waits
 * in {@link queue} and is handed to whichever worker frees up first, so every
 * worker stays busy for as long as there is work left.
 */
export class WorkerPool {
  private readonly entries: WorkerEntry[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queue: QueuedJob[] = [];
  private disposed = false;

  constructor(size = WORKER_POOL_SIZE) {
    for (let i = 0; i < size; i++) {
      this.entries.push(this.spawn());
    }
  }

  parse(fileName: string, data: Uint8Array, options?: { extractCover?: boolean }): Promise<BaseMetadata> {
    if (this.disposed) {
      return Promise.reject(new Error("WorkerPool is disposed"));
    }

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

  /** Feeds queued jobs to idle workers until one side runs out. */
  private pump(): void {
    while (this.queue.length > 0) {
      const entry = this.entries.find(e => !e.busy);
      if (!entry) return;
      this.dispatch(entry, this.queue.shift()!);
    }
  }

  private dispatch(entry: WorkerEntry, job: QueuedJob): void {
    const id = crypto.randomUUID();
    entry.busy = true;

    // Started here rather than on submit, so queue wait never eats the budget.
    const timeoutId = setTimeout(() => {
      this.pending.delete(id);
      // A worker that blew the budget is presumed wedged — replace it instead
      // of handing it more work behind whatever it is still chewing on.
      this.replace(entry);
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
    if (!this.disposed) this.pump();
  }

  private replace(entry: WorkerEntry): void {
    if (this.disposed) return;

    const index = this.entries.indexOf(entry);
    if (index === -1) return;

    entry.worker.terminate();
    this.entries[index] = this.spawn();
    this.pump();
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
