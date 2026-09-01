import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findByOwners: vi.fn(),
}));
vi.mock("@/queries/cover.queries", () => ({
  getCoverBlobsByOwners: (type: string, ids: string[]) => repo.findByOwners(type, ids),
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

import { createCoverCache } from "../cover-cache";

const blob = (name: string) => new Blob([name], { type: "image/jpeg" });
const album = (id: string) => ({ ownerType: "album" as const, ownerId: id });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe("cover cache", () => {
  let revoked: string[];

  beforeEach(() => {
    revoked = [];
    let n = 0;
    URL.createObjectURL = vi.fn(() => `blob:${++n}`);
    URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url); });
    repo.findByOwners.mockReset();
    repo.findByOwners.mockImplementation(async (_type: string, ids: string[]) =>
      new Map(ids.filter(id => !id.startsWith("none")).map(id => [id, blob(id)])),
    );
  });

  it("reads every owner requested in one tick with a single query", async () => {
    const cache = createCoverCache();
    cache.acquire(album("a"));
    cache.acquire(album("b"));
    cache.acquire(album("a"));
    expect(cache.entryFor(album("a"))).toBeUndefined();

    await flush();

    expect(repo.findByOwners).toHaveBeenCalledTimes(1);
    expect(repo.findByOwners.mock.calls[0][1]).toEqual(["a", "b"]);
    expect(cache.entryFor(album("a"))?.url).toBe("blob:1");
    expect(cache.entryFor(album("b"))?.url).toBe("blob:2");
    expect(cache.entryFor(album("a"))?.blob).toBeInstanceOf(Blob);
  });

  it("remembers an owner without a cover as null instead of asking again", async () => {
    const cache = createCoverCache();
    cache.acquire(album("none-1"));
    await flush();
    expect(cache.entryFor(album("none-1"))).toBeNull();

    cache.acquire(album("none-1"));
    await flush();
    expect(repo.findByOwners).toHaveBeenCalledTimes(1);
  });

  it("keeps a released owner for quick re-mounts and revokes past the idle cap", async () => {
    const cache = createCoverCache({ maxIdle: 2 });
    const releases = ["a", "b", "c"].map(id => cache.acquire(album(id)));
    await flush();

    releases[0]();
    releases[1]();
    expect(revoked).toEqual([]);
    // A re-mount within the idle tail costs no query.
    cache.acquire(album("a"));
    await flush();
    expect(repo.findByOwners).toHaveBeenCalledTimes(1);

    // Third idle owner: the oldest idle one ("b") goes.
    releases[2]();
    const releaseD = cache.acquire(album("d"));
    await flush();
    releaseD();
    expect(cache.entryFor(album("b"))).toBeUndefined();
    expect(revoked).toContain("blob:2");
    expect(cache.entryFor(album("a"))?.url).toBe("blob:1");
  });

  it("publishes a written cover at once and keeps the URL for an unchanged blob", async () => {
    const cache = createCoverCache();
    cache.acquire(album("a"));
    await flush();
    const first = cache.entryFor(album("a"))!;

    const edited = blob("edited");
    cache.set(album("a"), edited);
    expect(cache.entryFor(album("a"))?.blob).toBe(edited);
    expect(cache.entryFor(album("a"))?.url).toBe("blob:2");
    expect(revoked).toContain(first.url);

    cache.set(album("a"), edited);
    expect(cache.entryFor(album("a"))?.url).toBe("blob:2");

    cache.set(album("a"), null);
    expect(cache.entryFor(album("a"))).toBeNull();
    expect(repo.findByOwners).toHaveBeenCalledTimes(1);
  });

  it("re-reads a held owner on invalidate and forgets an idle one", async () => {
    const cache = createCoverCache();
    const release = cache.acquire(album("a"));
    cache.acquire(album("b"));
    await flush();
    release();

    cache.invalidate(album("a"));
    cache.invalidate(album("b"));
    await flush();

    expect(cache.entryFor(album("a"))).toBeUndefined();
    expect(revoked).toContain("blob:1");
    expect(cache.entryFor(album("b"))?.url).toBe("blob:3");
    expect(revoked).toContain("blob:2");
  });

  it("invalidateAll drops idle owners and refreshes the held ones", async () => {
    const cache = createCoverCache();
    const release = cache.acquire(album("a"));
    cache.acquire(album("b"));
    await flush();
    release();
    repo.findByOwners.mockClear();

    cache.invalidateAll();
    await flush();

    expect(cache.size).toBe(1);
    expect(repo.findByOwners).toHaveBeenCalledTimes(1);
    expect(repo.findByOwners.mock.calls[0][1]).toEqual(["b"]);
  });
});
