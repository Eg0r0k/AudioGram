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
    :class="inline ? 'relative shrink-0' : 'absolute bottom-[calc(1rem+var(--keyboard-inset,0px)+var(--mobile-bottom-inset,0px))] right-4 z-50'"
  >
    <slot />
  </Motion>
</template>

<script setup lang="ts">
import { Motion, useReducedMotion } from "motion-v";

// The absolute variant sits at bottom-4 plus --keyboard-inset: a host panel
// that measures the on-screen keyboard (useKeyboardInset) sets the variable
// on its root and the button lifts above the keyboard; without it the calc
// collapses to plain bottom-4. --mobile-bottom-inset (MobileLayout) likewise
// lifts it above the floating mini-player + nav dock.
defineProps<{
  show: boolean;
  inline?: boolean;
}>();

const prefersReduced = useReducedMotion();
</script>
