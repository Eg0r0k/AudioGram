<template>
  <div
    ref="rootRef"
    class="relative flex flex-1 min-h-0 flex-col overflow-hidden"
  >
    <VirtualScrollable
      ref="virtualRef"
      :items="upcomingQueueItems"
      :estimate-size="ITEM_HEIGHT"
      :item-height="ITEM_HEIGHT"
      :overscan="4"
      :padding-bottom="8"
      :get-item-key="getItemKey"
      keep-scroll-anchor
      class="queue-up-next-list flex-1 bg-card"
      :class="[isSettling && 'is-settling', drag && 'is-dragging']"
    >
      <template #default="{ item, index }">
        <QueueDraggableRow
          :id="item.id"
          :index="index"
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

    <motion.div
      class="queue-drag-ghost pointer-events-none absolute top-0 left-0 z-20"
      :class="!isGhostShown && 'invisible'"
      drag="y"
      :drag-listener="false"
      :drag-controls="dragControls"
      :drag-momentum="false"
      :drag-elastic="0"
      :style="{ top: `${ghostBox.top}px`, left: `${ghostBox.left}px`, width: `${ghostBox.width}px`, y: ghostY }"
      @drag="onDrag"
      @drag-end="onDragEnd"
    >
      <div ref="ghostContentRef" />
    </motion.div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, provide, ref, shallowRef, useTemplateRef } from "vue";
import { animate, motion, useDragControls, useMotionValue } from "motion-v";
import type { QueueItemId } from "@/types/ids";
import { useQueueStore } from "../store/queue.store";
import {
  dropIndexAt,
  edgeScrollSpeed,
  queueDragKey,
  type QueueDragState,
} from "../lib/queue-drag";
import type { QueueItem } from "../types";
import type { Track } from "@/modules/player/types";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import QueueDraggableRow from "./QueueDraggableRow.vue";

const ITEM_HEIGHT = 64;
// Pointer this close to the list's top/bottom edge scrolls it, faster the
// closer to the edge (px per frame at the very edge).
const SCROLL_EDGE_PX = 56;
const SCROLL_MAX_SPEED = 14;

const queueStore = useQueueStore();
const rootRef = useTemplateRef<HTMLDivElement>("rootRef");
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

// ── Drag to reorder ─────────────────────────────────────────────────────────
// The virtualizer positions rows itself and unmounts them as they scroll out,
// so the lifted row cannot be the thing that follows the pointer: it stays in
// its slot, hidden, while a ghost outside the scroll content tracks the
// pointer (immune to the list scrolling under it). Rows between the lift and
// the hovered slot slide one row to open the gap (a CSS transition, see the
// row); on drop the store reorders, every shift snaps to zero in that same
// render, and the ghost glides from where it was released into the landed
// slot.

const drag = shallowRef<QueueDragState | null>(null);
const settlingId = ref<QueueItemId | null>(null);
const isSettling = ref(false);
// The ghost is a DOM clone of the lifted row, so it matches the list row
// exactly (compact mode, cover, width), placed over the row's own box in the
// root's coordinates. Shown through the landing glide after `drag` itself
// has cleared. The root clips it: dragged past the list's edge it disappears
// instead of growing an ancestor's scrollable overflow, while the pointer
// keeps driving the hovered slot and the auto-scroll.
const ghostContentRef = useTemplateRef<HTMLDivElement>("ghostContentRef");
const isGhostShown = ref(false);
const ghostBox = ref({ top: 0, left: 0, width: 0 });
const ghostY = useMotionValue(0);
const dragControls = useDragControls();

let lastPointerY = 0;
let scrollFrame: number | null = null;

const stopAutoScroll = () => {
  if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
  scrollFrame = null;
};

const updateHoveredSlot = () => {
  const state = drag.value;
  const container = scrollContainer.value;
  if (!state || !container) return;
  const rect = container.getBoundingClientRect();
  const contentY = lastPointerY - rect.top + container.scrollTop;
  const to = dropIndexAt(contentY, ITEM_HEIGHT, upcomingQueueItems.value.length);
  if (to !== state.to) drag.value = { ...state, to };
};

const autoScrollStep = () => {
  scrollFrame = null;
  const container = scrollContainer.value;
  if (!drag.value || !container) return;
  const rect = container.getBoundingClientRect();
  const speed = edgeScrollSpeed(lastPointerY, rect.top, rect.bottom, SCROLL_EDGE_PX, SCROLL_MAX_SPEED);
  if (speed === 0) return;
  const before = container.scrollTop;
  container.scrollTop = before + speed;
  if (container.scrollTop !== before) updateHoveredSlot();
  scrollFrame = requestAnimationFrame(autoScrollStep);
};

const startDrag = (index: number, event: PointerEvent) => {
  const item = upcomingQueueItems.value[index] as QueueItem | undefined;
  const root = rootRef.value;
  const rowEl = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-vkey]");
  if (!item || !root || !rowEl) return;

  const rowRect = rowEl.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  ghostBox.value = { top: rowRect.top - rootRect.top, left: rowRect.left - rootRect.left, width: rowRect.width };
  const content = rowEl.querySelector<HTMLElement>(".queue-sortable-row") ?? rowEl;
  const clone = content.cloneNode(true) as HTMLElement;
  clone.classList.remove("opacity-0");
  clone.style.transform = "";
  ghostContentRef.value?.replaceChildren(clone);
  ghostY.jump(0);
  lastPointerY = event.clientY;
  isGhostShown.value = true;
  drag.value = { item, from: index, to: index };
  dragControls.start(event);
};

const onDrag = (event: PointerEvent) => {
  lastPointerY = event.clientY;
  updateHoveredSlot();
  if (scrollFrame === null) scrollFrame = requestAnimationFrame(autoScrollStep);
};

const onDragEnd = async () => {
  const state = drag.value;
  if (!state) return;
  stopAutoScroll();

  // Commit and snap in one render: the store reorders, the rows' shifts
  // reset without animating, the virtualizer's own transition is off.
  settlingId.value = state.item.id;
  isSettling.value = true;
  drag.value = null;
  if (state.from !== state.to) {
    queueStore.moveTrack(toQueueIndex(state.from), toQueueIndex(state.to));
  }
  await nextTick();

  const root = rootRef.value;
  const container = scrollContainer.value;
  if (root && container) {
    const slotTop = container.getBoundingClientRect().top - root.getBoundingClientRect().top
      + state.to * ITEM_HEIGHT - container.scrollTop;
    await animate(ghostY, slotTop - ghostBox.value.top, { duration: 0.18, ease: [0.23, 1, 0.32, 1] });
  }

  settlingId.value = null;
  isGhostShown.value = false;
  ghostContentRef.value?.replaceChildren();
  requestAnimationFrame(() => {
    isSettling.value = false;
  });
};

provide(queueDragKey, { drag, settlingId, isSettling, itemHeight: ITEM_HEIGHT, startDrag });

onUnmounted(stopAutoScroll);
</script>

<style>
/* Non-drag reorders (a removal, "play next") slide the rows to their new
   offsets; rows are absolutely positioned via translateY, so the wrapper
   transform is what transitions. A drop must not: the rows already sit where
   the reorder puts them, so during that render the transition is off. */
.queue-up-next-list [data-index] {
  transition: transform 0.3s var(--ease-standard);
}

.queue-up-next-list .queue-sortable-row {
  transition: transform 0.16s cubic-bezier(0, 0, 0.2, 1);
}

.queue-up-next-list.is-dragging .queue-sortable-row {
  will-change: transform;
}

.queue-up-next-list.is-settling [data-index],
.queue-up-next-list.is-settling .queue-sortable-row {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .queue-up-next-list [data-index],
  .queue-up-next-list .queue-sortable-row {
    transition: none;
  }
}

.queue-drag-ghost .queue-sortable-row {
  background: var(--color-accent);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  opacity: 0.95;
}
</style>
