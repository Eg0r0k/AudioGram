<template>
  <Scrollable
    direction="horizontal"
    hide-thumb
    :class="cn('w-full', props.class)"
  >
    <div :class="cn('flex w-max items-stretch gap-4 py-2', props.contentClass)">
      <slot />
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";
import Scrollable from "./Scrollable.vue";

const props = defineProps<{
  class?: HTMLAttributes["class"];
  contentClass?: HTMLAttributes["class"];
}>();
</script>
