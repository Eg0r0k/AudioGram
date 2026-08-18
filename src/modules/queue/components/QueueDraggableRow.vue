<template>
  <div
    ref="rowRef"
    class="queue-sortable-row relative bg-card px-2"
    :class="isDragging && 'opacity-30'"
  >
    <slot />
    <div
      v-if="dropEdge"
      class="pointer-events-none absolute left-3 right-3 z-10 h-0.5 rounded-full bg-primary"
      :class="dropEdge === 'top' ? 'top-0' : 'bottom-0'"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { makeDraggable } from "@vue-dnd-kit/core";
import type { QueueItem } from "../types";

// id keeps drag identity stable while the virtual list unmounts/remounts
// rows mid-drag; the payload feeds suggestSort in QueueUpNext's onDrop.
const props = defineProps<{
  id: string;
  index: number;
  items: QueueItem[];
}>();

const rowRef = useTemplateRef<HTMLElement>("rowRef");

const { isDragging, isDragOver } = makeDraggable(rowRef, {
  id: props.id,
  dragHandle: "[data-drag-handle]",
  activation: { distance: 5 },
}, () => [props.index, props.items]);

const dropEdge = computed(() => {
  if (isDragging.value) return null;
  const placement = isDragOver.value;
  if (placement?.top) return "top";
  if (placement?.bottom) return "bottom";
  return null;
});
</script>

<style>
/* The default drag preview clones the row markup into a fixed container on
   <body> — non-scoped on purpose. The row itself is transparent, so give
   the floating clone a card look. */
.dnd-kit-preview .queue-sortable-row {
  background: var(--color-accent);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  opacity: 0.95;
}
</style>
