<template>
  <div class="mt-6 flex flex-col gap-2 landscape-short:mt-3">
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
      :show-thumb="true"
      :show-tooltip="false"
      allow-marking
      style="--range-height-hover: 4px; --range-radius: 9999px;"
      @add-mark="addMarkAt"
      @mousedown="emit('scrubStart')"
      @scrub="value => emit('scrub', value)"
      @mouseup="emit('scrubEnd')"
    />
    <div class="flex justify-between text-sm text-white/60 font-medium tabular-nums">
      <span>{{ timeDisplay.current }}</span>
      <span>{{ timeDisplay.duration }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RangeSelector } from "@/modules/player";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useDisplayedPlaybackTime } from "@/modules/player/composables/useDisplayedPlaybackTime";
import { useCurrentTrackChapters } from "@/modules/tracks/composables/useCurrentTrackChapters";
import { formatDuration } from "@/lib/format/time";
import { useMobilePlayerProgress } from "./progress-context";

const { displayProgress, isTransitionEnabled } = useMobilePlayerProgress();

const emit = defineEmits<{
  scrubStart: [];
  scrub: [value: number];
  scrubEnd: [];
}>();

const playerStore = usePlayerStore();
const { chapters, addMarkAt } = useCurrentTrackChapters();

const { currentTime: displayedTime, duration: displayedDuration } = useDisplayedPlaybackTime();

const timeDisplay = computed(() => {
  if (playerStore.isLiveStream) return { current: "🔴", duration: "LIVE" };
  return {
    current: formatDuration(displayedTime.value),
    duration: displayedDuration.value === null ? "–:––" : formatDuration(displayedDuration.value),
  };
});
</script>
