import type { StorageLike } from "pinia-plugin-persistedstate";

/**
 * `localStorage` for pinia-plugin-persistedstate that coalesces writes.
 *
 * The plugin serialises on every mutation of a picked path: the player's
 * position changes on each `timeupdate` (~4/s for the whole session) and
 * the queue rebuilds its snapshot on every commit (a drag-reorder is a burst
 * of them). Each of those was a synchronous JSON stringify + `setItem`.
 * Writes are held per key for `delayMs` and flushed when the page is hidden
 * or unloading, so at most that much of the latest state is at risk.
 */
export const createDebouncedLocalStorage = (delayMs: number): StorageLike => {
  const pending = new Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>();

  const flush = (key: string) => {
    const entry = pending.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(key);
    localStorage.setItem(key, entry.value);
  };
  const flushAll = () => {
    for (const key of [...pending.keys()]) flush(key);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flushAll);
    window.addEventListener("beforeunload", flushAll);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushAll();
    });
  }

  return {
    getItem: (key) => {
      // A read must see what was written, even if it has not landed yet.
      const entry = pending.get(key);
      return entry ? entry.value : localStorage.getItem(key);
    },
    setItem: (key, value) => {
      const entry = pending.get(key);
      if (entry) clearTimeout(entry.timer);
      pending.set(key, { value, timer: setTimeout(() => flush(key), delayMs) });
    },
  };
};
