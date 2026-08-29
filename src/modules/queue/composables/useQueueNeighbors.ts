import { computed } from "vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
import { useStickyCoverUrl } from "@/modules/covers/composables/useStickyCoverUrl";
import { isLibraryTrack, type PlayerTrack } from "@/modules/player/types";
import type { QueueItem } from "@/modules/queue/types";

export const isSameTrack = (a: PlayerTrack | null | undefined, b: PlayerTrack | null | undefined) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

interface QueueNeighborsOptions {
  /**
   * Track the strip is centred on. Defaults to the track the player is
   * displaying; a swipe host overrides it with the track it has just slid
   * to, so the strip re-anchors immediately instead of waiting for the
   * player to load it.
   */
  anchor?: () => PlayerTrack | null;
}

/**
 * The queue entry a strip is centred on plus the entries a horizontal swipe
 * would land on, with their cover art, for rendering previous/current/next
 * side by side.
 *
 * Everything is anchored on a *track*, not on the queue cursor: `next()`/
 * `jumpTo()` move the cursor synchronously while `player.currentTrack` only
 * follows once the new track has loaded, and in that window cursor-based
 * neighbours would preview the wrong entries.
 */
export const useQueueNeighbors = (options: QueueNeighborsOptions = {}) => {
  const queueStore = useQueueStore();
  const playerStore = usePlayerStore();
  const anchorTrack = options.anchor ?? (() => playerStore.currentTrack);

  const anchorIndex = computed(() => {
    const anchor = anchorTrack();
    if (!anchor || isSameTrack(anchor, queueStore.currentTrack)) return queueStore.currentIndex;
    const index = queueStore.queue.findIndex(item => isSameTrack(item.track, anchor));
    return index >= 0 ? index : queueStore.currentIndex;
  });

  const anchorItem = computed<QueueItem | null>(() =>
    anchorIndex.value >= 0 ? queueStore.queue[anchorIndex.value] ?? null : null,
  );

  // A single-entry queue wraps onto itself under repeat; that is not a
  // neighbour to preview or to swipe to.
  const otherThanAnchor = (index: number) => (index >= 0 && index !== anchorIndex.value ? index : -1);

  // Mirrors next(): the entry after the anchor, wrapping in repeat-all and in
  // repeat-one (a user "next" there drops back to repeat-all and moves on).
  const nextIndex = computed(() => {
    const queue = queueStore.queue;
    const index = anchorIndex.value;
    if (index < 0 || queue.length === 0) return -1;
    if (index < queue.length - 1) return index + 1;
    return otherThanAnchor(queueStore.repeatMode === "off" ? -1 : 0);
  });

  const previousIndex = computed(() => {
    const queue = queueStore.queue;
    const index = anchorIndex.value;
    if (index < 0 || queue.length === 0) return -1;
    if (index > 0) return index - 1;
    return otherThanAnchor(queueStore.repeatMode === "all" ? queue.length - 1 : -1);
  });

  const nextItem = computed<QueueItem | null>(() =>
    nextIndex.value >= 0 ? queueStore.queue[nextIndex.value] ?? null : null,
  );

  const previousItem = computed<QueueItem | null>(() =>
    previousIndex.value >= 0 ? queueStore.queue[previousIndex.value] ?? null : null,
  );

  // Each slot's URL holds the previous cover while the next query loads, so
  // a slot that switches to a not-yet-fetched entry never flashes the
  // fallback art in between.
  const useItemCover = (item: () => QueueItem | null) => {
    const { url, isLoading } = useTrackCover(() => {
      const track = item()?.track;
      return track && isLibraryTrack(track) ? track : null;
    });
    return useStickyCoverUrl(
      () => {
        const entry = item();
        if (!entry) return undefined;
        if (entry.track.kind === "ephemeral") return entry.track.cover ?? entry.cover ?? undefined;
        return url.value ?? entry.cover ?? undefined;
      },
      () => isLoading.value,
    );
  };

  const anchorCoverUrl = useItemCover(() => anchorItem.value);
  const nextCoverUrl = useItemCover(() => nextItem.value);
  const previousCoverUrl = useItemCover(() => previousItem.value);

  const goNext = () => {
    queueStore.next().catch(() => {});
  };

  // Not previous(): past the restart threshold that only rewinds the current
  // track, while a swipe that previewed the previous entry must land on it.
  const goPrevious = () => {
    const index = previousIndex.value;
    if (index < 0) return;
    queueStore.jumpTo(index).catch(() => {});
  };

  return {
    anchorItem,
    anchorCoverUrl,
    nextItem,
    previousItem,
    nextCoverUrl,
    previousCoverUrl,
    goNext,
    goPrevious,
  };
};
