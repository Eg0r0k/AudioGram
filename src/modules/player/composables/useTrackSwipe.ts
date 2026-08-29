import { computed, ref, watch } from "vue";
import { animate, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "motion-v";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { isSameTrack, useQueueNeighbors } from "@/modules/queue/composables/useQueueNeighbors";
import type { PlayerTrack } from "@/modules/player/types";

export type SwipeDirection = 1 | -1;
export type SwipeSlotRole = "previous" | "center" | "next";

export interface SwipeSlot {
  role: SwipeSlotRole;
  track: PlayerTrack;
  coverUrl: string | undefined;
  /**
   * Queue item id, so when the centre moves by one entry the element that
   * was beside it is the same DOM node (same <img>, same src — nothing
   * reloads) now in the centre role. A two-entry queue under repeat-all has
   * the same entry on both sides; the previous one gets a suffix.
   */
  key: string;
}

interface TrackSwipeOptions {
  /** Distance (px) between a card and its neighbour — how far a slide travels. */
  width: () => number;
  /** Pointer travel (px) that turns a pull into a track change. */
  offsetThreshold?: number;
  /** Release velocity (px/s) that turns a short flick into a track change. */
  velocityThreshold?: number;
}

// Zero-size constraints keep the strip anchored at its origin; all visible
// movement comes from `dragElastic`, and on release motion springs it back.
export const SWIPE_DRAG_CONSTRAINTS = { left: 0, right: 0, top: 0, bottom: 0 };
export const SWIPE_DRAG_TRANSITION = { bounceStiffness: 520, bounceDamping: 42 };
const SLIDE_TRANSITION = { type: "spring", stiffness: 420, damping: 40 } as const;

// The strip follows the finger freely toward a track that exists and resists
// noticeably when there is nothing in that direction.
const ELASTIC_FREE = 0.85;
const ELASTIC_STIFF = 0.2;

/**
 * A strip of previous/current/next queue entries rendered side by side,
 * dragged as a whole to switch tracks.
 *
 * The strip is always laid out around its anchor entry. Whenever the anchor
 * moves by one entry — a swipe released past its threshold, the next/previous
 * buttons, a track ending — the slots re-anchor at once, the offset is
 * shifted by one slot so the painted picture does not change (the element
 * that was beside the centre is the same DOM node, now centred), and the
 * strip then springs to rest. A swipe merely advances the queue and sets the
 * anchor to its target so the picture does not wait for the player to load
 * it; the override is dropped once the player shows that track.
 */
export const useTrackSwipe = (options: TrackSwipeOptions) => {
  const { offsetThreshold = 56, velocityThreshold = 500 } = options;

  const playerStore = usePlayerStore();
  const queueStore = useQueueStore();
  const prefersReduced = useReducedMotion();

  const viewAnchor = ref<PlayerTrack | null>(null);
  const neighbors = useQueueNeighbors({
    anchor: () => viewAnchor.value ?? playerStore.currentTrack,
  });

  watch(() => playerStore.currentTrack, (track) => {
    if (viewAnchor.value && isSameTrack(track, viewAnchor.value)) viewAnchor.value = null;
  });
  // The queue was pointed somewhere else (a failed track skipped, a tap in
  // the queue panel): follow the player again rather than a stale target.
  watch(() => queueStore.currentTrack, (track) => {
    if (viewAnchor.value && !isSameTrack(track, viewAnchor.value)) viewAnchor.value = null;
  });

  const slots = computed<SwipeSlot[]>(() => {
    const center = neighbors.anchorItem.value;
    const centerTrack = center?.track ?? playerStore.currentTrack;
    if (!centerTrack) return [];
    const centerId = center?.id ?? `${centerTrack.kind}:${centerTrack.id}`;
    const previous = neighbors.previousItem.value;
    const next = neighbors.nextItem.value;
    const list: SwipeSlot[] = [];

    if (previous) {
      // A two-entry queue under repeat-all shows the same entry on both sides.
      const alsoNext = next !== null && previous.id === next.id;
      list.push({
        role: "previous",
        track: previous.track,
        coverUrl: neighbors.previousCoverUrl.value,
        key: alsoNext ? `${previous.id}:previous` : previous.id,
      });
    }
    list.push({ role: "center", track: centerTrack, coverUrl: neighbors.anchorCoverUrl.value, key: centerId });
    if (next) {
      list.push({ role: "next", track: next.track, coverUrl: neighbors.nextCoverUrl.value, key: next.id });
    }
    return list;
  });

  const x = useMotionValue(0);
  const isDragging = ref(false);

  // Pre-flush, so the offset shift lands in the same paint as the re-keyed
  // DOM. Only a move to an adjacent entry animates; an arbitrary jump (queue
  // panel, shuffle) just re-renders.
  const keyOf = (list: SwipeSlot[], role: SwipeSlotRole) => list.find(slot => slot.role === role)?.key;
  watch(slots, (current, previous) => {
    const center = keyOf(current, "center");
    if (center === keyOf(previous, "center")) return;
    let shift = 0;
    if (center === keyOf(previous, "next")) shift = 1;
    else if (center === keyOf(previous, "previous")) shift = -1;
    if (shift === 0) return;
    if (prefersReduced.value) {
      x.jump(0);
      return;
    }
    x.jump(x.get() + shift * options.width());
    animate(x, 0, SLIDE_TRANSITION);
  });

  const canGo = (direction: SwipeDirection) =>
    direction === 1 ? neighbors.nextItem.value !== null : neighbors.previousItem.value !== null;

  const horizontalElastic = computed(() => ({
    left: canGo(1) ? ELASTIC_FREE : ELASTIC_STIFF,
    right: canGo(-1) ? ELASTIC_FREE : ELASTIC_STIFF,
  }));

  const resolveDirection = (info: PanInfo): SwipeDirection | 0 => {
    const { offset, velocity } = info;
    const pulledNext
      = offset.x < 0 && (offset.x <= -offsetThreshold || velocity.x <= -velocityThreshold);
    const pulledPrevious
      = offset.x > 0 && (offset.x >= offsetThreshold || velocity.x >= velocityThreshold);
    if (pulledNext && canGo(1)) return 1;
    if (pulledPrevious && canGo(-1)) return -1;
    return 0;
  };

  // The drag is started from the host's *static* wrapper, not from the strip
  // itself: while the strip is settling it has moved out from under the
  // finger and the slot there is a pointer-events-none neighbour, so a
  // pointerdown on the strip would never begin a gesture.
  const dragControls = useDragControls();
  const startDrag = (event: PointerEvent) => dragControls.start(event);

  const handleDragStart = () => {
    isDragging.value = true;
  };

  // `horizontal` lets a host that also handles vertical pulls skip the track
  // logic for gestures locked to the other axis.
  const handleDragEnd = (info: PanInfo, horizontal = true) => {
    isDragging.value = false;
    if (!horizontal) return;
    const direction = resolveDirection(info);
    if (direction === 0) return;
    const target = direction === 1 ? neighbors.nextItem.value : neighbors.previousItem.value;
    if (!target) return;
    // goPrevious() resolves its index from the current anchor, so advance the
    // queue before the anchor moves to the target.
    if (direction === 1) neighbors.goNext();
    else neighbors.goPrevious();
    viewAnchor.value = target.track;
  };

  return {
    x,
    isDragging,
    slots,
    horizontalElastic,
    /** Pass to the strip's `drag-controls` (with `drag-listener` false). */
    dragControls,
    /** Bind to `pointerdown` on the static wrapper around the strip. */
    startDrag,
    handleDragStart,
    handleDragEnd,
  };
};
