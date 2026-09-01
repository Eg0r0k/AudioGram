<template>
  <div
    class="queue-sortable-row relative bg-card px-2"
    :class="isLifted && 'opacity-0'"
    :style="shiftStyle"
    @pointerdown="onPointerDown"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import type { QueueItemId } from "@/types/ids";
import { queueDragKey, rowShift } from "../lib/queue-drag";

// The row never moves with the pointer itself: the ghost in QueueUpNext does.
// This row only slides out of the way of the gap, and hides while its own
// item is the one being dragged (or still gliding into place after a drop).
//
// The slide is a CSS transition on an inline transform rather than a motion
// animation on purpose: a drop reorders the virtualizer's wrappers in one
// Vue render and must zero this shift in that same render, and motion writes
// its values a frame later — long enough for the neighbour to flash at the
// old offset over its new slot. QueueUpNext turns the transition off for the
// render that lands the drop.
const props = defineProps<{
  id: QueueItemId;
  index: number;
}>();

const dragContext = inject(queueDragKey);
if (!dragContext) throw new Error("QueueDraggableRow must be rendered inside QueueUpNext");

const isLifted = computed(() =>
  dragContext.drag.value?.item.id === props.id || dragContext.settlingId.value === props.id,
);

const shiftStyle = computed(() => {
  const drag = dragContext.drag.value;
  const shift = drag ? rowShift(props.index, drag.from, drag.to) : 0;
  return shift === 0 ? undefined : { transform: `translateY(${shift * dragContext.itemHeight}px)` };
});

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  if (!(event.target as HTMLElement | null)?.closest("[data-drag-handle]")) return;
  event.preventDefault();
  dragContext.startDrag(props.index, event);
};
</script>
