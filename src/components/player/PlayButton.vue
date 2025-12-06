<template>
  <Motion :whilePress="{ scale: 0.95 }">
    <Button @click="toggle" class="p-0 size-10 min-w-10 rounded-full">
      <motion.svg tabindex="-1" width="32" height="32" viewBox="0 0 24 24">
        <motion.path tabindex="-1" :d="d" fill="currentColor" />
      </motion.svg>
    </Button>
  </Motion>
</template>

<script setup lang="ts">
import { Motion, motion, motionValue, useTransform, animate } from "motion-v";
import { interpolate } from "flubber";
import { Button } from "@/components/ui/button";
import { ref } from "vue";

const play =
  "M21.409 9.353a2.998 2.998 0 0 1 0 5.294L8.597 21.614C6.534 22.737 4 21.277 4 18.968V5.033c0-2.31 2.534-3.769 4.597-2.648z";

const pause =
  "M2 6c0-1.886 0-2.828.586-3.414S4.114 2 6 2s2.828 0 3.414.586S10 4.114 10 6v12c0 1.886 0 2.828-.586 3.414S7.886 22 6 22s-2.828 0-3.414-.586S2 19.886 2 18zm12 0c0-1.886 0-2.828.586-3.414S16.114 2 18 2s2.828 0 3.414.586S22 4.114 22 6v12c0 1.886 0 2.828-.586 3.414S19.886 22 18 22s-2.828 0-3.414-.586S14 19.886 14 18z";

const paths = [play, pause];
const index = ref(0);

const progress = motionValue(0);
function centerInterpolate(a: string, b: string) {
  return interpolate(a, b, { maxSegmentLength: 0.1 });
}
const d = useTransform(progress, [0, 1], paths, {
  mixer: centerInterpolate,
});

function toggle() {
  const next = index.value === 0 ? 1 : 0;
  animate(progress, next, {
    duration: 0.2,
    ease: "anticipate",
  });
  index.value = next;
}
</script>
