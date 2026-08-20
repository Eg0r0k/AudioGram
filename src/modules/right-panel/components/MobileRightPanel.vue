<template>
  <div class="pointer-events-none fixed inset-0 top-(--toolbar-height)">
    <Transition name="right-panel-backdrop">
      <button
        v-if="rightPanel.isOpen"
        class="pointer-events-auto absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Close right panel"
        @click="rightPanel.close()"
      />
    </Transition>

    <Transition name="slide-panel">
      <div
        v-if="rightPanel.isOpen"
        class="pointer-events-auto absolute inset-0 overflow-hidden bg-card shadow-2xl"
        :style="{ paddingTop: top, paddingBottom: bottom }"
      >
        <RightPanelHost />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useScreenSafeArea } from "@vueuse/core";
import RightPanelHost from "@/modules/right-panel/components/RightPanelHost.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";

const rightPanel = useRightPanelStore();
const { top, bottom } = useScreenSafeArea();

registerOverlayBackHandler({
  isOpen: () => rightPanel.isOpen,
  back: () => rightPanel.back(),
  priority: 20,
});
</script>

<style scoped>
.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}

.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(100%);
}

.right-panel-backdrop-enter-active,
.right-panel-backdrop-leave-active {
  transition-property: opacity, backdrop-filter;
  transition-timing-function: cubic-bezier(0.23, 1, 0.32, 1);
}

.right-panel-backdrop-enter-active {
  transition-duration: 140ms;
}

.right-panel-backdrop-leave-active {
  transition-duration: 110ms;
}

.right-panel-backdrop-enter-from,
.right-panel-backdrop-leave-to {
  opacity: 0;
  backdrop-filter: blur(0);
}
</style>
