import MetaWorker from "@/workers/meta.worker?worker";
import type { BaseMetadata, ParseRequest, ParseResponse } from "@/workers/types";
import { ImportError } from "./types";

const WORKER_TIMEOUT = 30_000; // 30 sec
const WORKER_POOL_SIZE = 8;

interface PendingRequest {
  resolve: (meta: BaseMetadata) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface WorkerEntry {
  worker: Worker;
  busy: boolean;
}

export class WorkerPool {
  private readonly entries: WorkerEntry[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private disposed = false;

  constructor(size = WORKER_POOL_SIZE) {
    for (let i = 0; i < size; i++) {
      const worker = new MetaWorker();
      worker.addEventListener("message", this.onMessage);
      this.entries.push({ worker, busy: false });
    }
  }

  private getIdleWorker(): WorkerEntry | null {
    for (const entry of this.entries) {
      if (!entry.busy) return entry;
    }
    return null;
  }

  parse(fileName: string, data: Uint8Array, options?: { extractCover?: boolean }): Promise<BaseMetadata> {
    if (this.disposed) {
      return Promise.reject(new Error("WorkerPool is disposed"));
    }

    return new Promise<BaseMetadata>((resolve, reject) => {
      const id = crypto.randomUUID();

      const timeoutId = setTimeout(() => {
        this.pending.delete(id);
        reject(ImportError.workerTimeout(fileName));
      }, WORKER_TIMEOUT);

      this.pending.set(id, { resolve, reject, timeoutId });

      const entry = this.getIdleWorker() ?? this.entries[0];
      entry.busy = true;

      const request: ParseRequest = { fileId: id, fileData: data, fileName, extractCover: options?.extractCover ?? true };
      entry.worker.postMessage(request, [data.buffer]);
    });
  }

  dispose(): void {
    this.disposed = true;

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

  private onMessage = (e: MessageEvent<ParseResponse>): void => {
    const pending = this.pending.get(e.data.fileId);

    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pending.delete(e.data.fileId);

    // Mark the source worker as idle
    for (const entry of this.entries) {
      if (entry.worker === e.target) {
        entry.busy = false;
        break;
      }
    }

    if (e.data.success) {
      pending.resolve(e.data.meta);
    }
    else {
      pending.reject(new Error(e.data.error ?? "Worker parse error"));
    }
  };
}
