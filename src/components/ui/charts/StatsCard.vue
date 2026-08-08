<template>
  <section class="rounded-2xl  bg-popover p-5">
    <div class="mb-4 flex items-center gap-2">
      <component
        :is="icon"
        class="h-5 w-5 text-neutral-400"
      />
      <div>
        <h2 class="text-sm font-semibold text-neutral-200">
          {{ title }}
        </h2>
        <p
          v-if="subtitle"
          class="text-xs text-neutral-500"
        >
          {{ subtitle }}
        </p>
      </div>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
import type { Component } from "vue";

defineProps<{
  title: string;
  subtitle?: string;
  icon: Component;
}>();
</script>
