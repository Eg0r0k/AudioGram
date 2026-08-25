<template>
  <div
    class="grid min-h-0 grid-cols-[100%] grid-rows-[100%] overflow-hidden *:col-start-1 *:row-start-1 *:min-h-0"
    :class="props.class"
  >
    <Transition
      :enter-active-class="activeClass"
      enter-from-class="opacity-0"
      :leave-active-class="activeClass"
      leave-to-class="opacity-0"
    >
      <slot />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";

/**
 * Crossfades between two mutually exclusive states (a skeleton and the
 * loaded content, an empty state and a list, ...). Both children share one
 * grid cell, so the leaving one fades out while the entering one fades in
 * on top of it — no blank frame in between. Use `v-if` / `v-else` on the
 * slot content; different root elements need no keys.
 *
 * Reduced motion swaps instantly.
 */
const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

const activeClass = "transition-opacity duration-200 ease-standard motion-reduce:transition-none";
</script>
