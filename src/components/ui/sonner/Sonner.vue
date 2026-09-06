<script lang="ts" setup>
import type { ToasterProps } from "vue-sonner";
import { Toaster as Sonner } from "vue-sonner";
import { cn } from "@/lib/utils";

import IconCheck from "~icons/tabler/circle-check-filled";
import IconInfoCircle from "~icons/tabler/info-circle-filled";
import IconAlertTriangle from "~icons/tabler/alert-triangle-filled";
import IconCircleX from "~icons/tabler/circle-x-filled";
import IconLoader2 from "~icons/tabler/loader-2";
import IconX from "~icons/tabler/x";

const props = defineProps<ToasterProps>();
</script>

<template>
  <Sonner
    aria-live="polite"
    :class="cn('toaster group select-none', props.class)"
    :style="{ '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--border)', '--border-radius': 'var(--radius)', }"
    v-bind="props"
  >
    <template #success-icon>
      <IconCheck class="size-5" />
    </template>
    <template #info-icon>
      <IconInfoCircle class="size-5" />
    </template>
    <template #warning-icon>
      <IconAlertTriangle class="size-5" />
    </template>
    <template #error-icon>
      <IconCircleX class="size-5" />
    </template>
    <template #loading-icon>
      <div>
        <IconLoader2 class="size-5 animate-spin" />
      </div>
    </template>
    <template #close-icon>
      <IconX class="size-5" />
    </template>
  </Sonner>
</template>

<style>
.toaster {
  --normal-bg:  var(--popover)  !important;
}

[data-sonner-toast] {
      padding: 10px 14px !important;
   gap: 10px !important;
  border: none !important;
  /* backdrop-filter: blur(12px); */
  /* -webkit-backdrop-filter: blur(12px); */
  font-size: 13px !important;
  /* box-shadow: 0 8px 24px rgb(0 0 0 / 0.28) !important; */
}
[data-sonner-toast] [data-button] {
  background: transparent !important;
  color: var(--primary) !important;
  box-shadow: none !important;
  padding: 0 0.625rem !important;
  height: 2rem !important;
  font-size: 12px !important;
  border-radius: var(--radius-md) !important;
}

[data-sonner-toast] [data-button]:hover {
  background: color-mix(in oklch, var(--primary) 10%, transparent) !important;
}

@media (max-width: 1023px) {
  [data-sonner-toast][data-styled="true"] {
    gap: 10px !important;
    font-size: 13px !important;
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.2) !important;
  }
  [data-sonner-toast] [data-icon] svg {
    width: 18px;
    height: 18px;
  }
}
</style>
