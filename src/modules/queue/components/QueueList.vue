<template>
  <div class="flex flex-col h-full min-h-0 bg-background">
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
          <div class="flex min-w-0 items-baseline gap-1 px-4 pb-2 bg-card font-medium">
            <template v-if="sourceLink">
              <span class="shrink-0">{{ t("queue.upNextFrom") }}</span>
              <Link
                :to="sourceLink.to"
                class="min-w-0 truncate hover:underline"
              >
                {{ sourceLink.label }}
              </Link>
            </template>
            <span v-else>{{ t("queue.upNext") }}</span>
          </div>
          <QueueUpNext />
        </div>
      </TrackContextMenu>
      <TrackDropdown context="queue" />
    </template>

    <QueueEmpty v-else />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Link } from "@/components/ui/link";
import { useQueueStore } from "../store/queue.store";
import { useQueueSourceLink } from "../composables/useQueueSourceLink";
import type { QueueItem } from "../types";
import type { Track } from "@/modules/player/types";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import QueueEmpty from "./QueueEmpty.vue";
import QueueUpNext from "./QueueUpNext.vue";

const { t } = useI18n();

const queueStore = useQueueStore();
const { link: sourceLink } = useQueueSourceLink();

const currentQueueItem = computed<QueueItem | null>(() => {
  if (queueStore.currentIndex < 0) return null;
  return queueStore.queue[queueStore.currentIndex] ?? null;
});
</script>
