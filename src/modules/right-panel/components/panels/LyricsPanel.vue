<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      :title="$t('player.lyrics')"
      :description="playerStore.currentTrack?.title"
      :show-back="rightPanel.depth > 0"
      @back="rightPanel.back()"
      @close="rightPanel.close()"
    />

    <Scrollable class="min-h-0 flex-1">
      <div class="px-2 pb-8 pt-2">
        <CurrentTrackLyrics variant="panel" />
      </div>
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { Scrollable } from "@/components/ui/scrollable";
import CurrentTrackLyrics from "@/modules/player/components/CurrentTrackLyrics.vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";

const playerStore = usePlayerStore();
const rightPanel = useRightPanelStore();
</script>
