<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <template v-if="isLoading">
      <TrackRowLoading
        :rows="8"
        class="mt-2 bg-card px-2"
      />
    </template>

    <template v-else-if="isEmpty">
      <HistoryEmpty />
    </template>

    <template v-else>
      <TrackContextMenu context="history">
        <VirtualScrollable
          :items="entries"
          :estimate-size="ITEM_HEIGHT"
          :item-height="ITEM_HEIGHT"
          :overscan="6"
          :padding-top="8"
          :padding-bottom="8"
          :get-item-key="getItemKey"
          class="flex-1 bg-card mt-2"
        >
          <template #default="{ item, index }">
            <div class="px-4">
              <TrackRow
                hide-index
                menu-target="history"
                :track="(item as RecentHistoryEntry).track"
                @play="handlePlayTrack(index)"
              />
            </div>
          </template>
        </VirtualScrollable>
      </TrackContextMenu>

      <TrackDropdown context="history" />
    </template>
  </div>
</template>

<script setup lang="ts">
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import HistoryEmpty from "./HistoryEmpty.vue";
import { useHistoryList } from "../composables/useHistoryList";
import { useQueueStore } from "../store/queue.store";
import type { RecentHistoryEntry } from "@/queries/stats.queries";

const ITEM_HEIGHT = 64;

const queueStore = useQueueStore();
const { entries, isEmpty, isLoading } = useHistoryList();

function getItemKey(index: number): string | number {
  return entries.value[index]?.eventId ?? index;
}

async function handlePlayTrack(index: number) {
  const tracks = entries.value.map(entry => entry.track);
  if (tracks.length === 0) return;

  await queueStore.setQueue(tracks, index, { type: "history" });
}
</script>
