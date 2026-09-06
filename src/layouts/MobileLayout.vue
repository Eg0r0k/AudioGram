<template>
  <div
    ref="dropZoneRef"
    class="relative flex bg-muted dark:bg-card flex-col h-dvh overflow-hidden antialiased pt-[env(safe-area-inset-top,0px)] pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] pl-[env(safe-area-inset-left,0px)]"
  >
    <WindowToolbar class="toolbar" />
    <DropOverlay :show="isDragging" />

    <main
      class="isolate flex-1 overflow-y-auto overflow-x-hidden min-h-0"
      :style="{ '--mobile-bottom-inset': `${dockHeight}px` }"
    >
      <slot />
    </main>

    <div
      ref="dockRef"
      class="pointer-events-none absolute z-(--z-mobile-dock) flex flex-col gap-1 bottom-[env(safe-area-inset-bottom,0px)] left-[env(safe-area-inset-left,0px)] right-[env(safe-area-inset-right,0px)]"
    >
      <div
        v-if="playerStore.currentTrack"
        class="pointer-events-auto px-2"
      >
        <MiniPlayer
          :live="!isFullPlayerOpen"
          @click="isFullPlayerOpen = true"
        />
      </div>
      <div class="px-2">
        <MobileBottomNav class="pointer-events-auto" />
      </div>
    </div>

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
import { onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useElementSize } from "@vueuse/core";
import { mobileDockHeight } from "@/layouts/mobileDock";
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
import { getLogger } from "@/lib/logger";

const playerStore = usePlayerStore();
const { color: playerColor } = useMobilePlayerColor();

// The mini player idles under the full player: track changes there do not
// render into the dock. It catches up the moment the full player starts to
// close, so the closing slide already uncovers the current track.
const isFullPlayerOpen = ref(false);

// The mini-player + nav dock floats over the pages instead of taking a strip
// of the layout. Its measured height goes to `main` as --mobile-bottom-inset,
// which the scroll containers turn into bottom padding and the FAB into a
// bottom offset — so content is only covered by the dock until it scrolls.
// `isolate` on main keeps the page slide transition (z-index 50 while it
// runs) inside main's own stacking context, below the dock.
const dockRef = useTemplateRef<HTMLDivElement>("dockRef");
const { height: dockHeight } = useElementSize(dockRef, undefined, { box: "border-box" });
watch(dockHeight, (height) => {
  mobileDockHeight.value = height;
}, { immediate: true });
onUnmounted(() => {
  mobileDockHeight.value = 0;
});

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
    // The import pipeline reports its own progress and failures in the UI; this
    // only records a crash of the drop handler itself.
    importFiles(files).catch((err: unknown) => {
      getLogger().error(`[MobileLayout] Importing dropped files failed: ${String(err)}`);
    });
  },
});
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
