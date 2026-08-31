<template>
  <Motion
    tabindex="-1"
    :while-press="{ scale: 0.95 }"
    class="size-fit"
  >
    <Button
      :class="cn('relative p-0 size-10 min-w-10 rounded-full overflow-hidden', props.class)"
      :disabled="!canInteract"
      :aria-label="shouldShowPauseIcon ? $t('player.pause') : $t('player.play')"
      @click="toggle"
    >
      <MorphIcon
        tabindex="-1"
        :icon="shouldShowPauseIcon ? pausePath : playPath"
        :size="props.iconSize"
        spring="snappy"
        reduced-motion="user"
        class="morph-icon relative z-10"
      />

      <div
        v-if="playerStore.showLoadingIndicator"
        class="loader-ring pointer-events-none absolute inset-0 m-auto z-0"
      />
    </Button>
  </Motion>
</template>

<script setup lang="ts">
import { Motion } from "motion-v";
import { MorphIcon } from "morphicons/vue";
import { Button } from "@/components/ui/button";
import { computed, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { svgPathData } from "@/lib/svg";
import { getLogger } from "@/lib/logger";
import { usePlayerStore } from "@/modules/player/store/player.store";
import playSvg from "@/assets/icons/play-rounded.svg?raw";
import pauseSvg from "@/assets/icons/pause-rounded.svg?raw";

interface Props {
  class?: HTMLAttributes["class"];
  iconSize?: number;
}

const props = withDefaults(defineProps<Props>(), { iconSize: 32, class: undefined });
const playerStore = usePlayerStore();

const playPath = svgPathData(playSvg);
const pausePath = svgPathData(pauseSvg);

const isLoading = computed(() => playerStore.isLoading);
const shouldShowPauseIcon = computed(() => playerStore.isPlaying || isLoading.value);
const canInteract = computed(() => !playerStore.showLoadingIndicator);

const toggle = () => {
  if (isLoading.value) return;
  playerStore.togglePlay()
    .catch(error => getLogger().error(`[Player] Toggling playback failed: ${String(error)}`));
};
</script>

<style scoped>
.morph-icon {
  fill: currentColor;
  stroke: none;
}

.loader-ring {
  width: 40px;
  aspect-ratio: 1;
  border-radius: 50%;
  border: 3px solid currentColor;
  animation:
    l20-1 0.8s infinite linear alternate,
    l20-2 1.6s infinite linear;
}
@keyframes l20-1 {
  0% {
    clip-path: polygon(50% 50%, 0 0, 50% 0%, 50% 0%, 50% 0%, 50% 0%, 50% 0%);
  }
  12.5% {
    clip-path: polygon(50% 50%, 0 0, 50% 0%, 100% 0%, 100% 0%, 100% 0%, 100% 0%);
  }
  25% {
    clip-path: polygon(50% 50%, 0 0, 50% 0%, 100% 0%, 100% 100%, 100% 100%, 100% 100%);
  }
  50% {
    clip-path: polygon(50% 50%, 0 0, 50% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 100%);
  }
  62.5% {
    clip-path: polygon(50% 50%, 100% 0, 100% 0%, 100% 0%, 100% 100%, 50% 100%, 0% 100%);
  }
  75% {
    clip-path: polygon(50% 50%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 50% 100%, 0% 100%);
  }
  100% {
    clip-path: polygon(50% 50%, 50% 100%, 50% 100%, 50% 100%, 50% 100%, 50% 100%, 0% 100%);
  }
}

@keyframes l20-2 {
  0% {
    transform: scaleY(1) rotate(0deg);
  }
  49.99% {
    transform: scaleY(1) rotate(135deg);
  }
  50% {
    transform: scaleY(-1) rotate(0deg);
  }
  100% {
    transform: scaleY(-1) rotate(-135deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loader-ring {
    animation: none;
  }
}
</style>
