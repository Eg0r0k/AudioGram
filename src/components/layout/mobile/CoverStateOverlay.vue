<template>
  <AnimatePresence>
    <Motion
      v-if="visible"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      :transition="{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }"
      class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/50"
    >
      <slot />
    </Motion>
  </AnimatePresence>
</template>
<script setup lang="ts">
import { AnimatePresence, Motion } from "motion-v";

defineProps<{ visible: boolean }>();
</script>
