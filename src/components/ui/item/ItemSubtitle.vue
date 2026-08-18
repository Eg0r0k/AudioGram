<script setup lang="ts">
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "vue";

const props = defineProps<{
  class?: HTMLAttributes["class"];
}>();

</script>

<template>
  <div
    data-slot="item-subtitle"
    :class="cn('flex w-fit items-center text-sm text-muted-foreground font-medium', props.class)"
  >
    <slot />
  </div>
</template>
