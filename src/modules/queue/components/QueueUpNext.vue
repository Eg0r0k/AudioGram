<template>
  <VirtualScrollable
    ref="virtualRef"
    :items="upcomingQueueItems"
    :estimate-size="ITEM_HEIGHT"
    :item-height="ITEM_HEIGHT"
    :overscan="4"
    :padding-bottom="8"
    :get-item-key="getItemKey"
    class="queue-up-next-list flex-1 bg-card"
  >
    <template #default="{ item, index }">
      <QueueDraggableRow
        :id="item.id"
        :index="index"
        :items="upcomingQueueItems"
      >
        <TrackRow
          menu-target="queue"
          :track="item.track as Track"
          :index="toQueueIndex(index) + 1"
          :menu-index="toQueueIndex(index)"
          :queue-item-id="item.id"
          :draggable="true"
          @play="queueStore.jumpTo(toQueueIndex(index))"
        />
      </QueueDraggableRow>
    </template>
  </VirtualScrollable>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { makeAutoScroll, makeConstraintArea, makeDroppable } from "@vue-dnd-kit/core";
import type { IDragEvent } from "@vue-dnd-kit/core";
import { useQueueStore } from "../store/queue.store";
import { resolveQueueReorder } from "../lib/queue-order";
import type { QueueItem } from "../types";
import type { Track } from "@/modules/player/types";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import QueueDraggableRow from "./QueueDraggableRow.vue";

const ITEM_HEIGHT = 64;

const queueStore = useQueueStore();
const virtualRef = useTemplateRef("virtualRef");

const sliceOffset = computed(() => Math.max(queueStore.currentIndex + 1, 0));

const upcomingQueueItems = computed<QueueItem[]>(() =>
  queueStore.queue.slice(sliceOffset.value),
);

const toQueueIndex = (index: number) => index + sliceOffset.value;

const getItemKey = (index: number): string | number =>
  upcomingQueueItems.value[index]?.id ?? index;

const scrollContainer = computed<HTMLElement | null>(() =>
  (virtualRef.value as { container?: HTMLElement | null } | null)?.container ?? null,
);

const handleDrop = (event: IDragEvent) => {
  const suggestion = event.helpers.suggestSort("vertical");
  if (!suggestion) return;

  const move = resolveQueueReorder(suggestion, sliceOffset.value);
  if (move) queueStore.moveTrack(move.from, move.to);
};

// makeDroppable/makeAutoScroll register their element in onMounted only, so
// this component must not render before the scroll container exists —
// QueueList mounts it only when the queue is non-empty.
makeDroppable(scrollContainer, {
  events: { onDrop: handleDrop },
}, () => upcomingQueueItems.value);

makeAutoScroll(scrollContainer, { threshold: 70 });

// Vertical-only drag: the constraint area pins the preview's x to the
// dragged row's own left edge, so the ghost slides strictly along the list.
makeConstraintArea(scrollContainer, { axis: "y" });

// The docs' reorder animation (TransitionGroup + .list-move) doesn't apply to
// a virtual list: rows are absolutely positioned via translateY. Transitioning
// that transform gives the same slide — wrappers are keyed by queue item id,
// so on reorder the same element receives a new offset. Scroll doesn't touch
// these transforms (offsets are absolute), so nothing animates while scrolling.
</script>

<style>
.queue-up-next-list [data-index] {
  transition: transform 0.3s var(--ease-standard);
}

@media (prefers-reduced-motion: reduce) {
  .queue-up-next-list [data-index] {
    transition: none;
  }
}
</style>
