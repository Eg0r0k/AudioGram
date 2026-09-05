<script setup lang="ts">
import { usePlayerStore } from "@/modules/player/store/player.store";
import RangeSelector from "@/modules/player/components/RangeSelector.vue";
import SidebarMusic from "@/modules/player/components/SidebarMusic.vue";
import PlayBarControls from "@/modules/player/components/PlayBarControls.vue";
import SidebarControls from "@/modules/player/components/SidebarControls.vue";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { useCurrentTrackChapters } from "@/modules/tracks/composables/useCurrentTrackChapters";

const playerStore = usePlayerStore();
const { displayProgress, isTransitionEnabled, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();
const { chapters } = useCurrentTrackChapters();
</script>

<template>
  <footer class="p-3 bg-card ">
    <aside>
      <div class="relative flex items-center justify-between ">
        <div
          class="absolute -left-[11px] z-10 -top-3.5 -right-[11px]"
          :class="{ 'pointer-events-none opacity-50': !playerStore.canSeek }"
        >
          <RangeSelector
            :model-value="displayProgress"
            :step="1000 / 60 / 1000"
            :keyboard-step="5"
            :min="0"
            :max="100"
            :duration="playerStore.duration ?? 0"
            :chapters="chapters"
            :use-transform="true"
            :with-transition="false"
            :disable-transition="!isTransitionEnabled"
            :disabled="!playerStore.canSeek"
            @mousedown="onScrubStart"
            @scrub="onScrub"
            @mouseup="onScrubEnd"
          />
        </div>

        <SidebarMusic />
        <PlayBarControls />

        <SidebarControls />
      </div>
    </aside>
  </footer>
</template>
