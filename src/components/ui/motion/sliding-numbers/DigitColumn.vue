<script setup lang="ts">
import { Motion, useTransform, type MotionValue } from "motion-v";

const props = defineProps<{
  mv: MotionValue<number>;
  number: number;
  height: number;
}>();

const TRANSITION = {
  type: "spring" as const,
  stiffness: 280,
  damping: 18,
  mass: 0.3,
};

const y = useTransform(props.mv, (latest) => {
  if (!props.height) return 0;

  const placeValue = latest % 10;
  const offset = (10 + props.number - placeValue) % 10;
  let memo = offset * props.height;

  if (offset > 5) {
    memo -= 10 * props.height;
  }

  return memo;
});
</script>

<template>
  <Motion
    :style="{ y }"
    class="absolute inset-0 flex items-center justify-center"
    :transition="TRANSITION"
  >
    {{ number }}
  </Motion>
</template>
