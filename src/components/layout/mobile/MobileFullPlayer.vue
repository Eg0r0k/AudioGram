<template>
  <div
    ref="rootRef"
    class="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
  >
    <MobileFullPlayerHeader @close="closePlayer" />

    <div class="flex min-h-0 flex-1 flex-col w-full mx-auto px-6 pt-4 pb-6 max-w-md overflow-x-clip [mask-image:linear-gradient(to_right,transparent,#000_1.5rem,#000_calc(100%-1.5rem),transparent)] landscape-short:max-w-4xl landscape-short:flex-row landscape-short:items-stretch landscape-short:gap-6 landscape-short:px-4 landscape-short:pt-2 landscape-short:pb-4 landscape-short:[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]">
      <MobileFullPlayerCover />

      <div class="flex flex-col landscape-short:min-w-0 landscape-short:flex-1 landscape-short:justify-center">
        <MobileFullPlayerTrackInfo @close="closePlayer" />

        <MobileFullPlayerProgress
          @scrub-start="onScrubStart"
          @scrub="onScrub"
          @scrub-end="onScrubEnd"
        />

        <MobileFullPlayerControls />

        <MobileFullPlayerActions />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, provide, useTemplateRef } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { formatDuration } from "@/lib/format/time";
import { mobilePlayerProgressKey } from "@/components/layout/mobile/full-player/progress-context";

import MobileFullPlayerHeader from "@/components/layout/mobile/full-player/MobileFullPlayerHeader.vue";
import MobileFullPlayerCover from "@/components/layout/mobile/full-player/MobileFullPlayerCover.vue";
import MobileFullPlayerTrackInfo from "@/components/layout/mobile/full-player/MobileFullPlayerTrackInfo.vue";
import MobileFullPlayerProgress from "@/components/layout/mobile/full-player/MobileFullPlayerProgress.vue";
import MobileFullPlayerControls from "@/components/layout/mobile/full-player/MobileFullPlayerControls.vue";
import MobileFullPlayerActions from "@/components/layout/mobile/full-player/MobileFullPlayerActions.vue";

const emit = defineEmits<{
  close: [];
}>();

const rootRef = useTemplateRef<HTMLDivElement>("rootRef");
const playerStore = usePlayerStore();

// One progress instance for the whole player: the seek bar drives the scrub,
// and the cover paints the same scrub position over the artwork.
const {
  displayProgress,
  isTransitionEnabled,
  isScrubbing,
  scrubValue,
  onScrubStart,
  onScrub,
  onScrubEnd,
} = usePlayerProgress();

const scrubTimeDisplay = computed(() => {
  const duration = playerStore.duration ?? 0;
  const target = (scrubValue.value / 100) * duration;
  return `${formatDuration(target)} / ${formatDuration(duration)}`;
});

provide(mobilePlayerProgressKey, { displayProgress, isTransitionEnabled, isScrubbing, scrubTimeDisplay });

useSwipeControl(rootRef, {
  threshold: 50,
  onSwipeDown: () => emit("close"),
});

const closePlayer = () => {
  emit("close");
};
</script>
