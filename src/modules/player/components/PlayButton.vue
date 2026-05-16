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
      <motion.svg
        tabindex="-1"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        class="relative z-10"
      >
        <motion.path
          tabindex="-1"
          :d="morphedPath"
          fill="currentColor"
        />
      </motion.svg>

      <div
        v-if="isLoading"
        class="loader-ring pointer-events-none absolute inset-0 m-auto z-0"
      />
    </Button>
  </Motion>
</template>

<script setup lang="ts">
import { Motion, motion, motionValue, useTransform, animate } from "motion-v";
import { interpolate } from "flubber";
import { Button } from "@/components/ui/button";
import { computed, watch, type HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/modules/player/store/player.store";

interface Props {
  class?: HTMLAttributes["class"];
}

const props = defineProps<Props>();
const playerStore = usePlayerStore();

const playPath
  = "M21.409 9.353a2.998 2.998 0 0 1 0 5.294L8.597 21.614C6.534 22.737 4 21.277 4 18.968V5.033c0-2.31 2.534-3.769 4.597-2.648z";

const pausePath
  = "M2 6c0-1.886 0-2.828.586-3.414S4.114 2 6 2s2.828 0 3.414.586S10 4.114 10 6v12c0 1.886 0 2.828-.586 3.414S7.886 22 6 22s-2.828 0-3.414-.586S2 19.886 2 18zm12 0c0-1.886 0-2.828.586-3.414S16.114 2 18 2s2.828 0 3.414.586S22 4.114 22 6v12c0 1.886 0 2.828-.586 3.414S19.886 22 18 22s-2.828 0-3.414-.586S14 19.886 14 18z";

const paths = [playPath, pausePath];

const progress = motionValue(playerStore.isPlaying ? 1 : 0);

function centerInterpolate(a: string, b: string) {
  return interpolate(a, b, { maxSegmentLength: 2.5 });
}

const morphedPath = useTransform(progress, [0, 1], paths, {
  mixer: centerInterpolate,
});

const isLoading = computed(() => playerStore.isLoading || playerStore.status === "loading");
const shouldShowPauseIcon = computed(() => playerStore.isPlaying || isLoading.value);
const canInteract = computed(() => !isLoading.value);

watch(
  shouldShowPauseIcon,
  (showPauseIcon) => {
    animate(progress, showPauseIcon ? 1 : 0, {
      duration: 0.25,
      ease: "anticipate",
    });
  },
  { immediate: true },
);

function toggle() {
  if (isLoading.value) return;
  playerStore.togglePlay();
}
</script>

<style scoped>
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
</style>
