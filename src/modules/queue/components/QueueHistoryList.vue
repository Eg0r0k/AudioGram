<template>
  <div class="flex h-full min-h-0 flex-col justify-center items-center bg-background">
    <div class="flex flex-col gap-2 items-center justify-center">
      <IconLogo class=" text-muted-foreground" />

      <span class=" font-medium text-2xl">
        {{ $t('common.comingSoon') }}
      </span>
    </div>
    <!-- <div
      v-if="isLoading"
      class="flex flex-col gap-2 p-2"
    >
      <TrackRowLoading />
    </div>

    <div
      v-else-if="historyItems.length === 0"
      class="flex h-full flex-col bg-card items-center justify-center gap-3 text-center text-muted-foreground"
    >
      <IconHistory class="size-20" />
      <span class="text-sm font-medium">
        {{ t("queue.historyEmpty") }}
      </span>
    </div>

    <TrackContextMenu
      v-else
      context="history"
    >
      <VirtualScrollable
        :items="historyItems"
        :estimate-size="ITEM_HEIGHT"
        :item-height="ITEM_HEIGHT"
        :overscan="4"
        :padding-top="8"
        :padding-bottom="8"
        :get-item-key="getItemKey"
        class="flex-1 mt-2 bg-card"
      >
        <template #default="{ item, index }">
          <div class="px-2">
            <TrackRow
              menu-target="history"
              :track="item.track"
              :index="index + 1"
              :menu-index="index"
              :highlighted="isCurrentHistoryItem(index)"
              @play="playFromHistory(index)"
            />
          </div>
        </template>
      </VirtualScrollable>
    </TrackContextMenu>

    <TrackDropdown context="history" /> -->
  </div>
</template>
<!-- eslint-disable sonarjs/no-commented-code -->
<script setup lang="ts">
import IconLogo from "~icons/audiogram/logo";

// import { computed } from "vue";
// import { useI18n } from "vue-i18n";
// import { useQueries, useQuery } from "@tanstack/vue-query";
// import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
// import { useQueueStore } from "@/modules/queue/store/queue.store";
// import TrackRow from "@/modules/tracks/components/TrackRow.vue";
// import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
// import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
// import { coverQueries } from "@/queries/cover.queries";
// import { statsQueries, type RecentHistoryEntry } from "@/queries/stats.queries";
// import IconHistory from "~icons/tabler/history";
// import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";

// const HISTORY_LIMIT = 100;
// const ITEM_HEIGHT = 64;

// const { t } = useI18n();
// const queueStore = useQueueStore();

// const { data, isLoading } = useQuery(statsQueries.recentHistory(HISTORY_LIMIT));

// const historyItems = computed<RecentHistoryEntry[]>(() => data.value ?? []);
// const historyTracks = computed(() => historyItems.value.map(item => item.track));
// const historyAlbumIds = computed(() => [
//   ...new Set(historyItems.value.map(item => item.track.albumId)),
// ]);

// useQueries({
//   queries: computed(() => historyAlbumIds.value.map(albumId => coverQueries.detail("album", albumId))),
// });

// function getItemKey(index: number): string | number {
//   return historyItems.value[index]?.eventId ?? index;
// }

// async function playFromHistory(index: number): Promise<void> {
//   await queueStore.setQueue(historyTracks.value, index, { type: "history" });
// }

// function isCurrentHistoryItem(index: number): boolean {
//   return queueStore.currentIndex === index
//     && queueStore.currentItem?.source.type === "history";
// }

</script>
