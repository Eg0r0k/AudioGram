<template>
  <div
    ref="dropZoneRef"
    class="flex bg-muted dark:bg-card flex-col h-dvh overflow-hidden antialiased"
    :style="{ paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left }"
  >
    <WindowToolbar class="toolbar" />
    <DropOverlay :show="isDragging" />

    <main
      class="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
    >
      <slot />
    </main>
    <div class="px-2 py-1">
      <MiniPlayer
        v-if="playerStore.currentTrack"
        @click="isFullPlayerOpen = true"
      />
    </div>

    <MobileBottomNav />

    <Transition name="full-player">
      <div
        v-if="isFullPlayerOpen"
        class="fixed z-40 top-(--toolbar-height) bottom-0 left-0 right-0 full-player-bg"
        :style="{ '--player-bg': playerColor.hsl }"
      >
        <MobileFullPlayer
          class="h-full"
          @close="isFullPlayerOpen = false"
        />
      </div>
    </Transition>

    <MobileRightPanel class="z-(--z-mobile-right-panel)" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useScreenSafeArea } from "@vueuse/core";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useFileDrop } from "@/composables/useFileDrop";
import { registerOverlayBackHandler, useOverlayBackButton } from "@/composables/useOverlayBackButton";
import { useImport } from "@/modules/library/composables/useImport";
import { ACCEPTED_AUDIO_EXTENSIONS } from "@/lib/files/acceptedAudioExtensions";
import { useMobilePlayerColor } from "@/modules/player/composables/useMobilePlayerColor";
import DropOverlay from "@/components/DropOverlay.vue";
import MiniPlayer from "@/components/layout/mobile/MiniPlayer.vue";
import MobileBottomNav from "@/components/layout/mobile/MobileBottomNav.vue";
import MobileFullPlayer from "@/components/layout/mobile/MobileFullPlayer.vue";
import MobileRightPanel from "@/modules/right-panel/components/MobileRightPanel.vue";
import WindowToolbar from "@/components/WindowToolbar.vue";

const playerStore = usePlayerStore();
const { color: playerColor } = useMobilePlayerColor();

const isFullPlayerOpen = ref(false);

const closeFullPlayer = () => {
  isFullPlayerOpen.value = false;
};
const openFullPlayer = () => {
  isFullPlayerOpen.value = true;
};
defineExpose({ open: openFullPlayer, close: closeFullPlayer });

useOverlayBackButton();
registerOverlayBackHandler({
  depth: () => (isFullPlayerOpen.value ? 1 : 0),
  back: closeFullPlayer,
});

watch(() => playerStore.currentTrack, (track) => {
  if (!track && isFullPlayerOpen.value) isFullPlayerOpen.value = false;
});

const { importFiles } = useImport();

const { isDragging } = useFileDrop({
  acceptedExtensions: [...ACCEPTED_AUDIO_EXTENSIONS],
  onDrop: (files) => {
    importFiles(files);
  },
});

const { top, right, bottom, left } = useScreenSafeArea();
</script>

<style>
@property --player-bg {
  syntax: '<color>';
  inherits: false;
  initial-value: transparent;
}

.full-player-bg {
  background: linear-gradient(
    to bottom,
    var(--player-bg),
    color-mix(in srgb, var(--player-bg) 20%, black)
  );
  transition: --player-bg 900ms cubic-bezier(0.16, 1, 0.3, 1);
}

.full-player-enter-active {
  transition-property: transform, opacity, --player-bg;
  transition-timing-function: var(--ease-drawer);
  transition-duration: 350ms;
  will-change: transform, opacity;
}

.full-player-leave-active {
  transition-property: transform, opacity, --player-bg;
  transition-timing-function: var(--ease-drawer);
  transition-duration: 350ms;
  will-change: transform, opacity;
}

.full-player-enter-from,
.full-player-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.full-player-enter-to,
.full-player-leave-from {
  transform: translateY(0);
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .full-player-enter-active,
  .full-player-leave-active {
    transition-duration: 120ms;
  }

  .full-player-enter-from,
  .full-player-leave-to {
    transform: translateY(0);
  }
}
</style>
