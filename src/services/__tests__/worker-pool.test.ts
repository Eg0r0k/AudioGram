/**
 * {@link WorkerPool} is the throughput bottleneck of the import pipeline: the
 * pipeline runs up to PROCESS_CONCURRENCY parses at once against a fixed number
 * of workers, so how the pool spreads and re-dispatches work decides how long
 * a large import takes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseRequest, ParseResponse } from "@/workers/types";
import { ImportErrorCode } from "../types";

/** Records every worker instance so tests can inspect the distribution. */
const instances: FakeWorker[] = [];

class FakeWorker {
  static autoRespond = true;
  /** When set, a request is answered this many ms after it is dispatched. */
  static latencyMs = 0;
  readonly received: ParseRequest[] = [];
  readonly transfers: Array<Transferable[] | undefined> = [];
  terminated = false;
  private listeners: Array<(e: MessageEvent<ParseResponse>) => void> = [];

  constructor() {
    instances.push(this);
  }

  addEventListener(_type: string, cb: (e: MessageEvent<ParseResponse>) => void) {
    this.listeners.push(cb);
  }

  postMessage(request: ParseRequest, transfer?: Transferable[]) {
    this.received.push(request);
    this.transfers.push(transfer);
    if (FakeWorker.latencyMs > 0) {
      setTimeout(() => this.respond(request.fileId), FakeWorker.latencyMs);
    }
    else if (FakeWorker.autoRespond) {
      queueMicrotask(() => this.respond(request.fileId));
    }
  }

  terminate() {
    this.terminated = true;
  }

  /** Delivers a successful parse response for a queued request. */
  respond(fileId: string, meta?: Partial<{ title: string }>) {
    this.emit({
      success: true,
      fileId,
      meta: {
        title: meta?.title ?? "T",
        artists: [],
        album: "",
        duration: 1,
        format: { codec: "MP3" },
      },
    } as ParseResponse);
  }

  respondWithError(fileId: string, error: string) {
    this.emit({ success: false, fileId, error } as ParseResponse);
  }

  private emit(data: ParseResponse) {
    const event = { data, target: this } as unknown as MessageEvent<ParseResponse>;
    for (const cb of this.listeners) cb(event);
  }
}

vi.mock("@/workers/meta.worker?worker", () => ({ default: FakeWorker }));

const { WorkerPool } = await import("../worker-pool");

function bytes(n = 8): Uint8Array {
  return new Uint8Array(n);
}

describe("WorkerPool", () => {
  beforeEach(() => {
    instances.length = 0;
    FakeWorker.autoRespond = true;
    FakeWorker.latencyMs = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("spawns the requested number of workers", () => {
    const pool = new WorkerPool(4);

    expect(instances).toHaveLength(4);
    pool.dispose();
  });

  it("resolves with the metadata the worker returns", async () => {
    const pool = new WorkerPool(2);

    const meta = await pool.parse("a.mp3", bytes());

    expect(meta.title).toBe("T");
    pool.dispose();
  });

  it("rejects when the worker reports a parse error", async () => {
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(1);

    const promise = pool.parse("a.mp3", bytes());
    await Promise.resolve();
    instances[0].respondWithError(instances[0].received[0].fileId, "broken");

    await expect(promise).rejects.toThrow("broken");
    pool.dispose();
  });

  it("transfers the buffer instead of copying it", async () => {
    const pool = new WorkerPool(1);
    const data = bytes(64);

    await pool.parse("a.mp3", data);

    // Copying a 12 MB head buffer per file would dominate the import cost.
    expect(instances[0].transfers[0]).toEqual([data.buffer]);
    pool.dispose();
  });

  it("spreads concurrent work across all workers", async () => {
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(4);

    // The pipeline submits far more parses at once than the pool has workers.
    const pending = Array.from({ length: 12 }, (_, i) => pool.parse(`s${i}.mp3`, bytes()));
    await Promise.resolve();

    const busy = instances.filter(w => w.received.length > 0).length;
    expect(busy, "work must reach every worker, not pile up on the first").toBe(4);

    for (const worker of instances) {
      for (const req of worker.received) worker.respond(req.fileId);
    }
    await Promise.all(pending.slice(0, 4));
    pool.dispose();
  });

  it("hands a freed worker the next queued request", async () => {
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(2);

    const pending = Array.from({ length: 6 }, (_, i) => pool.parse(`s${i}.mp3`, bytes()));
    await Promise.resolve();

    const first = instances[0];
    const initial = first.received.length;
    first.respond(first.received[0].fileId);
    await Promise.resolve();
    await Promise.resolve();

    expect(first.received.length, "a freed worker must pick up more work").toBeGreaterThan(initial);

    for (const worker of instances) {
      for (const req of worker.received) worker.respond(req.fileId);
    }
    await Promise.allSettled(pending);
    pool.dispose();
  });

  it("keeps total in-flight work bounded by the pool size", async () => {
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(3);

    const pending = Array.from({ length: 20 }, (_, i) => pool.parse(`s${i}.mp3`, bytes()));
    await Promise.resolve();

    const dispatched = instances.reduce((sum, w) => sum + w.received.length, 0);
    expect(dispatched).toBeLessThanOrEqual(3);

    for (const worker of instances) {
      for (const req of worker.received) worker.respond(req.fileId);
    }
    await Promise.allSettled(pending.slice(0, 3));
    pool.dispose();
  });

  it("rejects with a worker timeout when the worker never answers", async () => {
    vi.useFakeTimers();
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(1);

    const promise = pool.parse("stuck.mp3", bytes());
    const assertion = expect(promise).rejects.toMatchObject({
      code: ImportErrorCode.WORKER_TIMEOUT,
    });
    await vi.advanceTimersByTimeAsync(31_000);
    await assertion;

    pool.dispose();
  });

  it("restores pool capacity after a request times out", async () => {
    vi.useFakeTimers();
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(1);

    // The assertion has to be attached before the clock moves, or the
    // rejection surfaces as an unhandled one.
    const stuck = expect(pool.parse("stuck.mp3", bytes())).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(31_000);
    await stuck;

    // The pool has a single worker; a leaked timeout would strand it forever.
    const next = pool.parse("next.mp3", bytes());
    await vi.advanceTimersByTimeAsync(0);

    const worker = instances.find(w => w.received.some(r => r.fileName === "next.mp3"));
    expect(worker, "a timed-out slot must accept new work").toBeDefined();

    worker!.respond(worker!.received.at(-1)!.fileId);
    await expect(next).resolves.toBeTruthy();
    pool.dispose();
  });

  it("retires the worker that blew its timeout budget", async () => {
    vi.useFakeTimers();
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(1);

    const stuck = expect(pool.parse("stuck.mp3", bytes())).rejects.toThrow();
    const wedged = instances[0];
    await vi.advanceTimersByTimeAsync(31_000);
    await stuck;

    expect(wedged.terminated, "a wedged worker must not be reused").toBe(true);
    expect(instances.length).toBe(2);
    pool.dispose();
  });

  it("does not start the timeout clock while a request waits in the queue", async () => {
    vi.useFakeTimers();
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(1);

    const first = pool.parse("first.mp3", bytes());
    const second = pool.parse("second.mp3", bytes());
    const secondSettled = vi.fn();
    void second.then(secondSettled, secondSettled);

    // The first request occupies the only worker for 25s, then completes.
    await vi.advanceTimersByTimeAsync(25_000);
    const worker = instances[0];
    worker.respond(worker.received[0].fileId);
    await expect(first).resolves.toBeTruthy();

    // The queued request has only just been dispatched; it must get a full budget.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(secondSettled, "queue wait must not count against the parse timeout").not.toHaveBeenCalled();

    const last = worker.received.at(-1)!;
    worker.respond(last.fileId);
    await expect(second).resolves.toBeTruthy();
    pool.dispose();
  });

  it("finishes a burst in pool-size-sized rounds, not one job at a time", async () => {
    vi.useFakeTimers();
    FakeWorker.latencyMs = 100;
    const pool = new WorkerPool(4);

    const jobs = 40;
    const done = Promise.all(
      Array.from({ length: jobs }, (_, i) => pool.parse(`s${i}.mp3`, bytes())),
    );

    // 40 jobs / 4 workers x 100ms = 1000ms of perfectly packed work. Piling the
    // surplus onto a single worker would instead need ~3700ms.
    await vi.advanceTimersByTimeAsync(1000);
    await expect(done).resolves.toHaveLength(jobs);

    pool.dispose();
  });

  it("rejects every pending request on dispose", async () => {
    FakeWorker.autoRespond = false;
    const pool = new WorkerPool(2);

    const pending = Array.from({ length: 5 }, (_, i) => pool.parse(`s${i}.mp3`, bytes()));
    pool.dispose();

    const settled = await Promise.allSettled(pending);
    expect(settled.every(s => s.status === "rejected")).toBe(true);
  });

  it("terminates every worker on dispose", () => {
    const pool = new WorkerPool(3);

    pool.dispose();

    expect(instances.every(w => w.terminated)).toBe(true);
  });

  it("rejects new work after dispose", async () => {
    const pool = new WorkerPool(1);
    pool.dispose();

    await expect(pool.parse("a.mp3", bytes())).rejects.toThrow(/disposed/i);
  });

  it("ignores a response for an unknown request id", async () => {
    const pool = new WorkerPool(1);

    expect(() => instances[0].respond("no-such-id")).not.toThrow();

    await expect(pool.parse("a.mp3", bytes())).resolves.toBeTruthy();
    pool.dispose();
  });
});
