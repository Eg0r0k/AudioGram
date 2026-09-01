import type { InjectionKey, Ref, ShallowRef } from "vue";
import type { QueueItemId } from "@/types/ids";
import type { QueueItem } from "../types";

//
// Drag-to-reorder over the virtualized "up next" list. The dragged row itself
// stays in place, invisible; a ghost outside the scroll content follows the
// pointer, and the rows between the lift point and the drop point slide one
// slot to open the gap where the item will land. Indexes are relative to the
// list being dragged (the upcoming slice), not the whole queue.
//

export interface QueueDragState {
  item: QueueItem;
  from: number;
  to: number;
}

export interface QueueDragContext {
  drag: ShallowRef<QueueDragState | null>;
  /** The entry whose ghost is still gliding into its new slot after a drop. */
  settlingId: Ref<QueueItemId | null>;
  /** Rows snap instead of animating while the reorder render lands. */
  isSettling: Ref<boolean>;
  itemHeight: number;
  startDrag: (index: number, event: PointerEvent) => void;
}

export const queueDragKey: InjectionKey<QueueDragContext> = Symbol("queueDrag");

/**
 * How many slots row `index` moves while the item at `from` hovers over
 * `to`: rows between them shift toward the vacated slot, everything else
 * (including the lifted row) stays.
 */
export const rowShift = (index: number, from: number, to: number): -1 | 0 | 1 => {
  if (index === from) return 0;
  if (from < index && index <= to) return -1;
  if (to <= index && index < from) return 1;
  return 0;
};

/**
 * The slot under a pointer at `contentY` (px from the top of the list
 * content, scroll included), clamped to the list.
 */
export const dropIndexAt = (contentY: number, itemHeight: number, count: number): number => {
  if (count <= 0) return 0;
  return Math.min(Math.max(Math.floor(contentY / itemHeight), 0), count - 1);
};

/**
 * Auto-scroll speed (px per frame, signed) for a pointer at `clientY` over a
 * container spanning `top..bottom`: zero away from the edges, ramping up to
 * `maxSpeed` at the very edge.
 */
export const edgeScrollSpeed = (
  clientY: number,
  top: number,
  bottom: number,
  edge: number,
  maxSpeed: number,
): number => {
  if (clientY < top + edge) {
    const depth = Math.min(1, (top + edge - clientY) / edge);
    return -Math.ceil(depth * maxSpeed);
  }
  if (clientY > bottom - edge) {
    const depth = Math.min(1, (clientY - (bottom - edge)) / edge);
    return Math.ceil(depth * maxSpeed);
  }
  return 0;
};
