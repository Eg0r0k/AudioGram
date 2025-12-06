<template>
  <span class="c-ripple" aria-hidden="true">
    <span
      v-for="wave in waves"
      :key="wave.id"
      class="c-ripple__circle"
      :class="{ hiding: wave.hiding }"
      :style="{
        width: `${wave.size}px`,
        height: `${wave.size}px`,
        left: `${wave.x - wave.size / 2}px`,
        top: `${wave.y - wave.size / 2}px`,
      }"
    />
  </span>
</template>

<script setup lang="ts">
import type { Wave } from "./useRipple";

defineProps<{
  waves: Wave[];
}>();
</script>

<style scoped>
.c-ripple {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  --ripple-duration: 0.4s;
  --ripple-start-scale: 0;
  --ripple-end-scale: 2;
  --ripple-color: currentColor;
  --ripple-max-opacity: 0.2;
}

@media only screen and (max-width: 925px) {
  .c-ripple {
    --ripple-duration: 0.4s;
    --ripple-start-scale: 0.27;
  }
}

.c-ripple__circle {
  display: block;
  position: absolute;
  border-radius: 50%;
  background-color: var(--ripple-color);
  pointer-events: none;

  opacity: var(--ripple-max-opacity, 1);

  transform: scale(var(--ripple-start-scale));
  animation-name: ripple-effect;
  animation-duration: var(--ripple-duration);
  animation-fill-mode: forwards;
  animation-timing-function: cubic-bezier(0.2, 0.3, 0.4, 1);

  transition: calc(var(--ripple-duration) / 2) opacity,
    calc(var(--ripple-duration) / 2) background-color;
}

.c-ripple__circle.hiding {
  opacity: 0;
}

@keyframes ripple-effect {
  from {
    transform: scale(var(--ripple-start-scale));
  }
  to {
    transform: scale(var(--ripple-end-scale));
  }
}
</style>
