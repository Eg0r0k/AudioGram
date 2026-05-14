<script setup lang="ts">
import { ref, watch } from "vue";
import { useMotionValue, useSpring } from "motion-v";
import { useElementSize } from "@vueuse/core";
import DigitColumn from "./DigitColumn.vue";

const props = defineProps<{
  value: number;
  place: number;
}>();

const TRANSITION = {
  type: "spring" as const,
  stiffness: 280,
  damping: 18,
  mass: 0.3,
};

const measureRef = ref<HTMLElement | null>(null);
const { height } = useElementSize(measureRef);

const base = useMotionValue(Math.floor(props.value / props.place) % 10);
const animatedValue = useSpring(base, TRANSITION);

watch(
  () => props.value,
  () => {
    base.set(Math.floor(props.value / props.place) % 10);
  },
);

watch(
  () => props.place,
  () => {
    base.set(Math.floor(props.value / props.place) % 10);
  },
);
</script>

<template>
  <div class="relative inline-block w-[1ch] overflow-y-clip overflow-x-visible leading-none tabular-nums">
    <div
      ref="measureRef"
      class="invisible"
    >
      0
    </div>

    <template v-if="height > 0">
      <DigitColumn
        v-for="i in 10"
        :key="i - 1"
        :mv="animatedValue"
        :number="i - 1"
        :height="height"
      />
    </template>
  </div>
</template>
