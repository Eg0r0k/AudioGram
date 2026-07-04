import MetaWorker from "@/workers/meta.worker?worker";
import type { BaseMetadata, ParseRequest, ParseResponse } from "@/workers/types";
import { ImportError } from "./types";

const WORKER_TIMEOUT = 10_000; // 10 sec
const WORKER_POOL_SIZE = 2;

interface PendingRequest {
  resolve: (meta: BaseMetadata) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class WorkerPool {
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private roundRobinIdx = 0;
  private disposed = false;

  constructor(size = WORKER_POOL_SIZE) {
    for (let i = 0; i < size; i++) {
      const worker = new MetaWorker();
      worker.addEventListener("message", this.onMessage);
      this.workers.push(worker);
    }
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

      const worker = this.workers[this.roundRobinIdx];
      this.roundRobinIdx = (this.roundRobinIdx + 1) % this.workers.length;

      const request: ParseRequest = { fileId: id, fileData: data, fileName, extractCover: options?.extractCover ?? true };
      worker.postMessage(request, [data.buffer]);
    });
  }

  dispose(): void {
    this.disposed = true;

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("WorkerPool disposed"));
      this.pending.delete(id);
    }

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers.length = 0;
  }

  private onMessage = (e: MessageEvent<ParseResponse>): void => {
    const pending = this.pending.get(e.data.fileId);

    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pending.delete(e.data.fileId);

    if (e.data.success) {
      pending.resolve(e.data.meta);
    }
    else {
      pending.reject(new Error(e.data.error ?? "Worker parse error"));
    }
  };
}
