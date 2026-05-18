<template>
  <Motion
    :initial="{ opacity: 0, scale: 0.5, y: 100 }"
    :animate="{
      opacity: show ? 1 : 0,
      scale: show ? 1 : 0.7,
      y: show ? 0 : 80,
      pointerEvents: show ? 'auto' : 'none'
    }"
    :transition="prefersReduced ? { duration: 0.1 } : {
      type: 'spring',
      stiffness: 300,
      damping: 25
    }"
    class="absolute bottom-4 right-4 z-50"
  >
    <slot />
  </Motion>
</template>

<script setup lang="ts">
import { Motion, useReducedMotion } from "motion-v";

defineProps<{
  show: boolean;
}>();

const prefersReduced = useReducedMotion();
</script>
