import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SearchDocument, WorkerRequest, WorkerResponse } from "../types";

// Reproduces Regression 3: getAllTracksForQueue calls the worker with an
// undefined limit expecting the FULL filtered set, but the worker used to coerce
// `undefined` to 50, truncating the queue so clicks past #50 hit findIndex === -1.
const posted: WorkerResponse[] = [];

function send(request: WorkerRequest): void {
  const handler = self.onmessage as ((event: MessageEvent<WorkerRequest>) => void) | null;
  if (!handler) throw new Error("worker onmessage handler not registered");
  handler({ data: request } as MessageEvent<WorkerRequest>);
}

function latestResults(): Extract<WorkerResponse, { action: "results" }> {
  const message = [...posted].reverse().find(m => m.action === "results");
  if (!message || message.action !== "results") throw new Error("no results message posted");
  return message;
}

const documents: SearchDocument[] = Array.from({ length: 60 }, (_, i) => ({
  id: `track:${i}`,
  type: "track",
  title: `Song ${i}`,
  entityId: `t${i}`,
}));

describe("search.worker limit handling", () => {
  beforeAll(async () => {
    vi.spyOn(self, "postMessage").mockImplementation((message: unknown) => {
      posted.push(message as WorkerResponse);
    });
    await import("../search.worker");
    send({ action: "build", documents });
  });

  it("returns ALL matches when limit is undefined (no implicit 50 cap)", () => {
    posted.length = 0;
    send({ action: "search", query: "song", id: 1, filter: "track", offset: 0, limit: undefined });

    const results = latestResults();
    expect(results.total).toBe(60);
    expect(results.results.length).toBe(60);
  });

  it("still respects an explicit limit", () => {
    posted.length = 0;
    send({ action: "search", query: "song", id: 2, filter: "track", offset: 0, limit: 50 });

    const results = latestResults();
    expect(results.total).toBe(60);
    expect(results.results.length).toBe(50);
  });
});
