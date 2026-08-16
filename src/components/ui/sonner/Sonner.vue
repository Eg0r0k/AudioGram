<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner";
import { Toaster as Sonner } from "vue-sonner";
import { cn } from "@/lib/utils";

import IconCheck from "~icons/tabler/check";
import IconInfoCircle from "~icons/tabler/info-circle";
import IconAlertTriangle from "~icons/tabler/alert-triangle";
import IconCircleX from "~icons/tabler/circle-x";
import IconLoader2 from "~icons/tabler/loader-2";
import IconX from "~icons/tabler/x";

const props = defineProps<ToasterProps>();
</script>

<template>
  <Sonner
    aria-live="polite"
    :class="cn('toaster group', props.class)"
    :style="{ '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)', '--border-radius': 'var(--radius)', }"
    v-bind="props"
  >
    <template #success-icon>
      <IconCheck class="size-6" />
    </template>
    <template #info-icon>
      <IconInfoCircle class="size-6" />
    </template>
    <template #warning-icon>
      <IconAlertTriangle class="size-6" />
    </template>
    <template #error-icon>
      <IconCircleX class="size-6" />
    </template>
    <template #loading-icon>
      <div>
        <IconLoader2 class="size-6 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <IconX class="size-6" />
    </template>
  </Sonner>
</template>

<style>
.toaster {
  --normal-bg: color-mix(in oklch, var(--popover) 70%, transparent) !important;
}

[data-sonner-toast] {
  gap: 16px !important;
  border: 1px solid color-mix(in oklch, var(--border) 60%, transparent) !important;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.28) !important;
}
[data-sonner-toast] [data-button] {
  background: transparent !important;
  color: var(--primary) !important;
  box-shadow: none !important;
  padding: 0 0.625rem !important;
  height: 2rem !important;
  font-size: 0.875rem !important;
  border-radius: var(--radius-md) !important;
}

[data-sonner-toast] [data-button]:hover {
  background: color-mix(in oklch, var(--primary) 10%, transparent) !important;
}
</style>
