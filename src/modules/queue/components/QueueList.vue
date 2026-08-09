<template>
  <div
    ref="rootRef"
    class="flex flex-col h-full min-h-0 bg-background"
  >
    <template v-if="!queueStore.isEmpty">
      <TrackContextMenu context="queue">
        <div class="flex flex-col flex-1 min-h-0">
          <div
            v-if="currentQueueItem"
            class="px-4 mt-2 py-2 bg-card"
          >
            <span class="mb-2 block font-medium">
              {{ t("queue.nowPlaying") }}
            </span>

            <div class="relative ">
              <TrackRow
                :hide-index="true"
                menu-target="queue"
                :track="currentQueueItem.track as Track"
                :menu-index="queueStore.currentIndex"
                :queue-item-id="currentQueueItem.id"
                :highlighted="true"
                @play="queueStore.jumpTo(queueStore.currentIndex)"
              />
            </div>
          </div>
          <div class="px-4 bg-card">
            <span class=" block font-medium pb-2  ">
              {{ t("queue.upNext") }}
            </span>
          </div>
          <VirtualScrollable
            ref="virtualRef"
            :items="upcomingQueueItems"
            :estimate-size="ITEM_HEIGHT"
            :item-height="ITEM_HEIGHT"
            :overscan="4"
            :padding-bottom="8"
            :get-item-key="getItemKey"
            class="flex-1 bg-card"
          >
            <template #default="{ item, index }">
              <div class="relative bg-card px-2 ">
                <TrackRow
                  menu-target="queue"
                  :track="item.track as Track"
                  :index="toQueueIndex(index) + 1"
                  :menu-index="toQueueIndex(index)"
                  :queue-item-id="item.id"
                  :draggable="true"
                  :highlighted="false"
                  :dimmed="false"
                  :being-dragged="drag.isDragging.value && drag.dragIndex.value === index"
                  @play="queueStore.jumpTo(toQueueIndex(index))"
                  @drag-start="drag.startDrag(index, $event)"
                />

                <div
                  v-if="showDropIndicator(index)"
                  class="absolute left-3 right-3 h-0.5 bg-primary rounded-full z-10 bottom-0"
                />
              </div>
            </template>
          </VirtualScrollable>
        </div>
      </TrackContextMenu>
      <TrackDropdown context="queue" />
    </template>

    <QueueEmpty v-else />

    <QueueDragOverlay
      :is-dragging="drag.isDragging.value"
      :dragged-item="draggedItem"
      :ghost-y="drag.ghostY.value"
      :container-left="containerRect.left"
      :container-width="containerRect.width"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useElementBounding } from "@vueuse/core";
import { useQueueStore } from "../store/queue.store";
import { useDragReorder } from "../composables/useDragReorder";
import type { QueueItem } from "../types";
import type { Track } from "@/modules/player/types";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import QueueDragOverlay from "./QueueDragOverlay.vue";
import QueueEmpty from "./QueueEmpty.vue";

const { t } = useI18n();

const ITEM_HEIGHT = 64;

const queueStore = useQueueStore();
const virtualRef = useTemplateRef("virtualRef");
const rootRef = useTemplateRef("rootRef");

const containerRect = reactive(useElementBounding(rootRef));

const getScrollContainer = (): HTMLElement | null => {
  return (virtualRef.value as { container?: HTMLElement | null })?.container ?? null;
};

const drag = useDragReorder({
  itemCount: computed(() => upcomingQueueItems.value.length),
  itemHeight: ITEM_HEIGHT,
  getScrollContainer,
  onReorder: (from, to) => {
    queueStore.moveTrack(toQueueIndex(from), toQueueIndex(to));
  },
});

const currentQueueItem = computed<QueueItem | null>(() => {
  if (queueStore.currentIndex < 0) return null;
  return queueStore.queue[queueStore.currentIndex] ?? null;
});

const upcomingQueueItems = computed<QueueItem[]>(() => {
  const startIndex = Math.max(queueStore.currentIndex + 1, 0);
  return queueStore.queue.slice(startIndex);
});

const draggedItem = computed<QueueItem | null>(() => {
  if (!drag.isDragging.value || drag.dragIndex.value < 0) return null;
  return upcomingQueueItems.value[drag.dragIndex.value] ?? null;
});

function getItemKey(index: number): string | number {
  return upcomingQueueItems.value[index]?.id ?? index;
}

function toQueueIndex(index: number): number {
  return index + Math.max(queueStore.currentIndex + 1, 0);
}

function showDropIndicator(index: number): boolean {
  if (!drag.isDragging.value) return false;
  const target = getDropTargetIndex();

  if (target < 0 || target >= upcomingQueueItems.value.length) return false;

  return index === target;
}

function getDropTargetIndex(): number {
  const drop = drag.dropIndex.value;
  const from = drag.dragIndex.value;

  if (drop < 0 || from < 0) return -1;

  const to = drop > from ? drop - 1 : drop;

  if (to === from) return -1;

  return to;
}
</script>
