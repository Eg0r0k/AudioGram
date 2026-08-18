<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { cn } from "@/lib/utils";

defineProps<{
  class?: HTMLAttributes["class"];
}>();
</script>

<template>
  <p
    data-slot="empty-description"
    :class="cn(
      'text-muted-foreground font-medium [&>a:hover]:text-primary text-sm/relaxed [&>a]:underline [&>a]:underline-offset-4',
      $attrs.class ?? '',
    )"
  >
    <slot />
  </p>
</template>
