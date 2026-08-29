<script setup lang="ts">
import { computed } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import RangeSelector from "@/modules/player/components/RangeSelector.vue";
import SidebarMusic from "@/modules/player/components/SidebarMusic.vue";
import PlayBarControls from "@/modules/player/components/PlayBarControls.vue";
import SidebarControls from "@/modules/player/components/SidebarControls.vue";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { useTrackChapters, useSaveTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import { isLibraryTrack } from "@/modules/player/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { TrackId } from "@/types/ids";

const playerStore = usePlayerStore();
const { displayProgress, isTransitionEnabled, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();
const rightPanelStore = useRightPanelStore();
const saveChapters = useSaveTrackChapters();

const trackId = computed<TrackId>(() => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return "" as TrackId;
  return track.id;
});

const { data: chapters } = useTrackChapters(trackId);

async function handleAddMark(percent: number) {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return;

  const time = (percent / 100) * (playerStore.duration ?? 0);
  const existing = chapters.value ?? [];
  const updated = [...existing, { time, title: "" }].sort((a, b) => a.time - b.time);
  await saveChapters.mutateAsync({ trackId: track.id, chapters: updated });

  rightPanelStore.openChapters({ track });
}
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
            allow-marking
            :disable-transition="!isTransitionEnabled"
            :disabled="!playerStore.canSeek"
            @add-mark="handleAddMark"
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
