<template>
  <div>
    <Button v-if="isSupported" size="icon-sm" variant="ghost" @click="toggle">
      <Icon
        class="size-4.5"
        :icon="
          isFullscreen ? 'tabler:arrows-minimize' : 'tabler:arrows-diagonal-2'
        "
      />
    </Button>
    <div ref="overlayRef" class="bg-background">
      <slot />

      <Button
        v-if="isFullscreen"
        @click="exit"
        class="absolute top-4 right-4"
        size="icon-sm"
        variant="ghost"
      >
        <Icon class="size-4.5" icon="tabler:x" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from "vue";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { useFullscreen } from "@vueuse/core";

//TODO: Make 2 components FullscreenButton and Overlay
const targetRef = useTemplateRef("overlayRef");

const { isFullscreen, toggle, isSupported, exit } = useFullscreen(targetRef);
</script>

<style scoped>
:fullscreen {
  z-index: var(--z-fullscreen);
  background-color: var(--background);
  overflow: auto;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
