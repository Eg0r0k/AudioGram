<template>
  <button
    ref="rootRef"
    class="relative flex shrink-0 w-full h-14 px-2 cursor-pointer text-left [-webkit-tap-highlight-color:transparent]"
    :aria-label="$t('player.nowPlaying')"
    @click="handleOpenFullPlayer"
  >
    <div
      class="relative flex-1 rounded-lg overflow-hidden transition-colors duration-300"
      :style="containerStyle"
    >
      <div class="flex items-center gap-2.5 px-2 h-14">
        <div class="size-10 shrink-0 rounded-md overflow-hidden flex items-center justify-center bg-black/20">
          <NuxtImage
            :src="coverUrl"
            :alt="currentTrack?.title ?? ''"
            fallback-src="/img/fallback.svg"
            class="size-full object-cover"
          />
        </div>

        <div class="flex-1 min-w-0 flex flex-col gap-px">
          <MarqueeBlock
            :duration="10"
            animate-on-overflow-only
            pause-on-hover
            gradient
            :gradient-color="gradientColor"
            gradient-length="20px"
          >
            <span class="text-sm font-medium leading-snug text-white">
              {{ currentTrack?.title ?? $t("player.nothing_playing") }}
            </span>
          </MarqueeBlock>
          <MarqueeBlock
            :duration="10"
            animate-on-overflow-only
            pause-on-hover
            gradient
            :gradient-color="gradientColor"
            gradient-length="20px"
          >
            <span class="text-[11px] text-white/80">
              {{ artistName ?? "" }}
            </span>
          </MarqueeBlock>
        </div>

        <div class="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-lg"
            class="rounded-full text-white"
            :aria-label="playerStore.isPlaying ? $t('player.pause') : $t('player.play')"
            @click.stop="playerStore.togglePlay()"
          >
            <component
              :is="playerStore.isPlaying ? IconPause : IconPlay"
              class="size-5"
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            class="rounded-full text-white"
            :aria-label="$t('player.queue')"
            @click.stop="rightPanel.openQueue()"
          >
            <IconPlaylist class="size-5" />
          </Button>
        </div>
      </div>

      <div class="absolute bottom-0 left-2 right-2">
        <div class="h-0.5 w-full bg-white/50 rounded-full">
          <div
            class="h-full bg-white rounded-full "
            :style="{ width: `${displayProgress}%` }"
          />
        </div>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useMobilePlayerColor } from "@/composables/useMobilePlayerColor";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { Button } from "@/components/ui/button";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import IconPlay from "~icons/tabler/player-play-filled";
import IconPause from "~icons/tabler/player-pause-filled";
import IconPlaylist from "~icons/tabler/playlist";

const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const rightPanel = useRightPanelStore();
const rootRef = useTemplateRef<HTMLButtonElement>("rootRef");

const emit = defineEmits<{
  click: [];
}>();

const currentTrack = computed(() => playerStore.currentTrack);
const artistName = computed(() => currentTrack.value?.artist);

const { color: playerColor, coverUrl } = useMobilePlayerColor();

const containerStyle = computed(() => ({
  background: `linear-gradient(color-mix(in srgb, ${playerColor.value.hsl} 25%, black))`,

}));

const gradientColor = computed(() => playerColor.value.hsl);

const { displayProgress } = usePlayerProgress();
const suppressClickUntil = ref(0);

function markSwipeHandled() {
  suppressClickUntil.value = Date.now() + 250;
}

function handleOpenFullPlayer() {
  if (Date.now() < suppressClickUntil.value) return;
  emit("click");
}

function handleSwipePrevious() {
  markSwipeHandled();
  if (!queueStore.hasPrevious) return;
  queueStore.previous();
}

function handleSwipeNext() {
  markSwipeHandled();
  if (!queueStore.hasNext) return;
  queueStore.next();
}

function handleSwipeUp() {
  markSwipeHandled();
  emit("click");
}

useSwipeControl(rootRef, {
  threshold: 40,
  onSwipeLeft: handleSwipeNext,
  onSwipeRight: handleSwipePrevious,
  onSwipeUp: handleSwipeUp,
});
</script>
