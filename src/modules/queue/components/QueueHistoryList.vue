<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <div class="flex items-center justify-between px-4 py-3 border-b border-border">
      <div class="flex items-center gap-2">
        <IconSparkles class="size-4 text-primary" />

        <span class="text-sm font-semibold">
          {{ $t("track.similarTracks") }}
        </span>
      </div>

      <span
        v-if="isLoading"
        class="text-xs text-muted-foreground"
      >
        Loading...
      </span>
    </div>

    <!-- Empty -->
    <div
      v-if="!isLoading && recommendations.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground"
    >
      <IconLogo class="size-12 opacity-50" />

      <span class="text-sm">
        {{ $t("track.similarTracksEmpty") }}
      </span>
    </div>

    <!-- Recommendations -->
    <div
      v-else
      class="flex flex-col gap-1 p-2 overflow-auto"
    >
      <button
        v-for="item in recommendations"
        :key="item.trackId"
        class="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60 text-left group"
        @click="handleAddToQueue(item.track)"
      >
        <div class="text-[9px] text-muted-foreground mt-1 space-x-1">
          <span>🎵{{ (item.breakdown.audioSimilarity * 100).toFixed(0) }}%</span>
          <span>🔗{{ (item.breakdown.coOccurrence * 100).toFixed(0) }}%</span>
          <span>✅{{ (item.breakdown.completionRate * 100).toFixed(0) }}%</span>
        </div>
        <!-- Cover -->
        <div class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
          <IconMusic class="size-4 text-muted-foreground" />
        </div>

        <!-- Meta -->
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium">
            {{ item.track.title }}
          </div>

          <div class="truncate text-xs text-muted-foreground">
            {{ item.track.artistName ?? "Unknown Artist" }}
          </div>
        </div>

        <!-- Score -->
        <div class="flex flex-col items-end shrink-0">
          <span class="text-sm font-semibold">
            {{ Math.round(item.score * 100) }}%
          </span>

          <span class="text-[10px] text-muted-foreground">
            match
          </span>
        </div>

        <IconPlaylistAdd
          class="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";

import { usePlayerStore } from "@/modules/player/store/player.store";
import { mapTrackEntityToPlayerTrack } from "@/modules/player/utils/trackEntity";

import { useQueueStore } from "@/modules/queue/store/queue.store";

import { useTrackRecommendations } from "@/modules/recommendations/composables/useRecommendations";

import type { TrackEntity } from "@/db/entities";

import IconLogo from "~icons/audiogram/logo";
import IconMusic from "~icons/tabler/music";
import IconPlaylistAdd from "~icons/tabler/playlist-add";
import IconSparkles from "~icons/tabler/sparkles";

const { t } = useI18n();

const playerStore = usePlayerStore();
const queueStore = useQueueStore();

const currentTrackId = computed(
  () => playerStore.currentTrack?.id,
);

const {
  recommendations,
  isLoading,
} = useTrackRecommendations(currentTrackId);

function handleAddToQueue(track: TrackEntity): void {
  const playerTrack = mapTrackEntityToPlayerTrack(track);

  queueStore.addToQueue(playerTrack);

  toast.success(
    t("track.addedToQueue", {
      title: track.title,
    }),
  );
}
</script>
