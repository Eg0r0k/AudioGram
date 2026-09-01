import { shallowReactive } from "vue";
import type { CoverOwnerType } from "@/db/entities";
import { getCoverBlobsByOwners } from "@/queries/cover.queries";
import { getLogger } from "@/lib/logger";

//
// The one place Dexie-stored covers live in memory. Every consumer — a list
// row, a hero image, the media session — registers interest in an owner
// (album, track, artist, playlist) and reads the resolved URL or Blob from
// here; owners requested in the same tick go to Dexie as one query.
//
// Remote art never enters: catalog rows (ND, YT) show their source's URL and
// ephemeral streams carry their own cover, both resolved before any lookup
// here. A downloaded or pinned remote track stores its cover in Dexie like a
// local one and comes through this cache like a local one.
//
// Memory is bounded by what is held plus a small idle tail: an owner nobody
// holds any more stays for MAX_IDLE releases (scrolling back does not
// re-read Dexie), then its object URL is revoked and the Blob reference
// dropped. Writes go through `set`/`invalidate` from the query layer — the
// same points that used to feed vue-query — so there is no second copy to
// keep in sync.
//

const MAX_IDLE = 64;

export interface CoverOwnerRef {
  ownerType: CoverOwnerType;
  ownerId: string;
}

export interface CoverEntry {
  url: string;
  blob: Blob;
}

const keyOf = (owner: CoverOwnerRef) => `${owner.ownerType}:${owner.ownerId}`;

export const createCoverCache = (options: { maxIdle?: number } = {}) => {
  const maxIdle = options.maxIdle ?? MAX_IDLE;
  // key → entry, or null for an owner that has no cover. Shallow-reactive so
  // a consumer's computed tracks exactly its own key.
  const entries = shallowReactive(new Map<string, CoverEntry | null>());
  const owners = new Map<string, CoverOwnerRef>();
  const refs = new Map<string, number>();
  // Insertion order is the LRU order of owners nobody holds.
  const idle = new Set<string>();
  const pending = new Map<string, CoverOwnerRef>();
  const inflight = new Set<string>();
  let flushScheduled = false;

  const drop = (key: string) => {
    idle.delete(key);
    const entry = entries.get(key);
    if (entry) URL.revokeObjectURL(entry.url);
    entries.delete(key);
    owners.delete(key);
  };

  const trimIdle = () => {
    for (const key of idle) {
      if (idle.size <= maxIdle) break;
      drop(key);
    }
  };

  const store = (key: string, blob: Blob | null | undefined) => {
    const previous = entries.get(key);
    // The same Blob instance again (a write that re-stored what was there)
    // keeps its URL, so an <img> showing it is not asked to reload.
    if (blob && previous && previous.blob === blob) return;
    entries.set(key, blob ? { url: URL.createObjectURL(blob), blob } : null);
    // A consumer switches to the new URL on its next render; the decoded
    // image it already painted does not depend on the old URL staying valid.
    if (previous) URL.revokeObjectURL(previous.url);
  };

  const flush = async () => {
    flushScheduled = false;
    const batch = [...pending.values()];
    pending.clear();
    const byType = new Map<CoverOwnerType, string[]>();
    for (const owner of batch) {
      const key = keyOf(owner);
      inflight.add(key);
      const ids = byType.get(owner.ownerType) ?? [];
      ids.push(owner.ownerId);
      byType.set(owner.ownerType, ids);
    }
    await Promise.all([...byType.entries()].map(async ([ownerType, ids]) => {
      let blobs: Map<string, Blob>;
      try {
        blobs = await getCoverBlobsByOwners(ownerType, ids);
      }
      catch (error) {
        getLogger().warn(`[Covers] Batch lookup failed: ${String(error)}`);
        for (const id of ids) inflight.delete(`${ownerType}:${id}`);
        return;
      }
      for (const id of ids) {
        const key = `${ownerType}:${id}`;
        inflight.delete(key);
        store(key, blobs.get(id) ?? null);
        if (!refs.has(key)) idle.add(key);
      }
      trimIdle();
    }));
  };

  const enqueue = (key: string, owner: CoverOwnerRef) => {
    if (pending.has(key) || inflight.has(key)) return;
    pending.set(key, owner);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(() => {
        flush().catch(error => getLogger().warn(`[Covers] Batch lookup failed: ${String(error)}`));
      });
    }
  };

  const release = (key: string) => {
    const count = (refs.get(key) ?? 1) - 1;
    if (count > 0) {
      refs.set(key, count);
      return;
    }
    refs.delete(key);
    if (entries.has(key)) {
      idle.delete(key);
      idle.add(key);
      trimIdle();
    }
  };

  /**
   * A consumer wants this owner's cover. Returns the release to call when it
   * no longer shows it. The entry arrives through `entryFor` once the batch
   * lands.
   */
  const acquire = (owner: CoverOwnerRef): (() => void) => {
    const key = keyOf(owner);
    owners.set(key, owner);
    refs.set(key, (refs.get(key) ?? 0) + 1);
    idle.delete(key);
    if (!entries.has(key)) enqueue(key, owner);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release(key);
    };
  };

  /** `undefined` while unresolved, `null` for an owner without a cover. */
  const entryFor = (owner: CoverOwnerRef): CoverEntry | null | undefined => entries.get(keyOf(owner));

  /** The owner's cover was written: publish it right away, no re-read. */
  const set = (owner: CoverOwnerRef, blob: Blob | null) => {
    const key = keyOf(owner);
    owners.set(key, owner);
    store(key, blob);
    if (!refs.has(key)) {
      idle.delete(key);
      idle.add(key);
      trimIdle();
    }
  };

  /** The owner's cover changed or went away: re-read it for the consumers holding it, forget it otherwise. */
  const invalidate = (owner: CoverOwnerRef) => {
    const key = keyOf(owner);
    if (refs.has(key)) {
      enqueue(key, owner);
      return;
    }
    if (entries.has(key)) drop(key);
  };

  /** The library changed wholesale (import, rescan, clear). */
  const invalidateAll = () => {
    for (const key of [...idle]) drop(key);
    for (const key of refs.keys()) {
      const owner = owners.get(key);
      if (owner) enqueue(key, owner);
    }
  };

  return {
    acquire,
    entryFor,
    set,
    invalidate,
    invalidateAll,
    /** Test seam. */
    get size() {
      return entries.size;
    },
  };
};

export const coverCache = createCoverCache();
