import { watch } from "vue";
import { getLogger } from "@/lib/logger";
import { platformCaps } from "@/lib/environment/platformCaps";
import { ytVideoIdFromStreamUrl } from "@/lib/stream-url";
import { offlineCopyRepository } from "@/db/repositories";
import { sources } from "@/modules/sources/registry";
import { parseTrackRef, ytTrackId } from "@/types/track-ref";
import type { TrackId } from "@/types/ids";
import { isLibraryTrack, type PlayerTrack, type RepeatMode } from "../types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "../store/player.store";

//
// Next-track prefetch coordinator: watches the queue/repeat state for what
// will ACTUALLY play next and warms that track's backend audio cache through
// the source provider, so the queue advance starts instantly from memory.
//
// Source-agnostic on purpose — the old per-source helpers each pattern-matched
// one track shape and silently skipped everything else (a library-pinned YT
// track was prefetched by neither). Here the target is reduced to a branded
// TrackId and dispatched through the sources registry.
//

// Wait out rapid queue skips before spending a download on the next track.
const DEBOUNCE_MS = 3000;
// Dedupes trigger bursts only. Deliberately shorter than the backend caches'
// lifetime: they evict by count, so a long TTL here would skip re-warming a
// track the backend already dropped. Re-invoking on a warm cache is cheap
// (the Rust commands check their cache first).
const SUCCESS_TTL_MS = 30_000;

/**
 * The queue index `next()` will advance to, or null when nothing upcoming
 * needs warming: empty queue, end of queue with repeat off, repeat-one
 * (replays the current track), or a single-track repeat-all loop.
 */
export const nextPlaybackIndex = (
  currentIndex: number,
  size: number,
  repeatMode: RepeatMode,
): number | null => {
  if (size === 0 || repeatMode === "one") return null;
  const next = currentIndex + 1;
  if (next < size) return next;
  if (repeatMode === "all" && size > 1) return 0;
  return null;
};

/**
 * Reduces any queue track to the branded remote TrackId to prefetch, or null
 * when playback needs no warm-up (local files, file/path ephemerals, radio
 * URLs). Ephemeral YT tracks carry their video id inside the `stream://…/yt/…`
 * URL — rebuilt into a `yt:` id so they dispatch like library YT tracks.
 */
export const prefetchIdOf = (track: PlayerTrack | null | undefined): TrackId | null => {
  if (!track) return null;

  if (isLibraryTrack(track)) {
    return parseTrackRef(track.id).kind === "local" ? null : track.id;
  }

  if (track.source.type !== "url") return null;
  const videoId = ytVideoIdFromStreamUrl(track.source.url);
  return videoId ? ytTrackId(videoId) : null;
};

interface PrefetcherDeps {
  /** Resolved fresh on every run — never a value captured at schedule time. */
  nextTrackId: () => TrackId | null;
  hasOfflineCopy: (id: TrackId) => Promise<boolean>;
  /** Returns null when the track's source cannot prefetch right now. */
  prefetch: (id: TrackId) => Promise<{ ok: boolean; error?: string }> | null;
}

interface PrefetcherOptions {
  debounceMs?: number;
  successTtlMs?: number;
}

/**
 * Debounced runner around the deps: `schedule()` on every trigger; after the
 * quiet period the CURRENT target is prefetched once. In-flight and
 * recent-success dedupe live here, source-independent.
 */
export const createNextTrackPrefetcher = (
  deps: PrefetcherDeps,
  options: PrefetcherOptions = {},
) => {
  const debounceMs = options.debounceMs ?? DEBOUNCE_MS;
  const successTtlMs = options.successTtlMs ?? SUCCESS_TTL_MS;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const inflight = new Set<TrackId>();
  const prefetchedAt = new Map<TrackId, number>();

  const run = async (): Promise<void> => {
    const id = deps.nextTrackId();
    if (!id || inflight.has(id)) return;

    const last = prefetchedAt.get(id);
    if (last !== undefined && Date.now() - last < successTtlMs) return;

    if (await deps.hasOfflineCopy(id)) return;

    const request = deps.prefetch(id);
    if (!request) return;

    inflight.add(id);
    getLogger().info(`[Prefetch] Warming next track: ${id}`);
    try {
      const result = await request;
      if (result.ok) {
        prefetchedAt.set(id, Date.now());
        getLogger().info(`[Prefetch] Warmed next track: ${id}`);
      }
      else {
        getLogger().warn(`[Prefetch] Failed for ${id}: ${result.error ?? "unknown"}`);
      }
    }
    finally {
      inflight.delete(id);
    }
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, debounceMs);
  };

  const dispose = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return { schedule, dispose };
};

/**
 * Wires the prefetcher to live state. The watcher covers every way the
 * upcoming track can change — track advance, queue reorder/insert/remove,
 * shuffle, repeat-mode switch — and `immediate` also warms the restored
 * queue on startup, which emits no trackChanged event.
 *
 * Called once from initPlayerLifecycle after Pinia is installed. Returns a
 * dispose that stops the watcher and any pending timer (tests; the app
 * itself never tears it down).
 */
export const initNextTrackPrefetch = (): (() => void) => {
  if (!platformCaps.canProxyStream) return () => {};

  const queue = useQueueStore();
  const player = usePlayerStore();

  const nextTrackId = (): TrackId | null => {
    const index = nextPlaybackIndex(queue.currentIndex, queue.size, player.repeatMode);
    if (index === null) return null;
    return prefetchIdOf(queue.queue[index]?.track);
  };

  const prefetcher = createNextTrackPrefetcher({
    nextTrackId,
    hasOfflineCopy: async (id) => {
      const copy = await offlineCopyRepository.findById(id);
      return copy.isOk() && copy.value !== undefined;
    },
    prefetch: (id) => {
      const provider = sources.get(parseTrackRef(id).kind);
      if (!provider.isAvailable || !provider.prefetch) return null;
      return provider.prefetch(id).match(
        () => ({ ok: true }),
        error => ({ ok: false, error: `[${error.kind}] ${error.message}` }),
      );
    },
  });

  const stopWatch = watch(nextTrackId, (id) => {
    if (id) prefetcher.schedule();
  }, { immediate: true });

  return () => {
    stopWatch();
    prefetcher.dispose();
  };
};
