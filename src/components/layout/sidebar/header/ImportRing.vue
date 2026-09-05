<template>
  <template v-if="isOpen">
    <svg
      class="pointer-events-none absolute inset-0 size-10 -rotate-90"
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        class="text-muted"
      />
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        class="text-primary transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
        data-testid="import-ring"
      />
    </svg>
    <span
      v-if="hasErrors"
      class="pointer-events-none absolute right-0 top-0 size-2 rounded-full bg-destructive ring-2 ring-background"
      data-testid="import-error-dot"
    />
    <span class="sr-only">{{ label }}</span>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useImport } from "@/modules/library/composables/useImport";

const CIRCUMFERENCE = 2 * Math.PI * 18;

const { t } = useI18n();
const { isOpen, isRunning, isPaused, progress, current, total, errorCount } = useImport();

const dashOffset = computed(() => {
  const percent = isRunning.value ? progress.value : 100;
  return CIRCUMFERENCE * (1 - percent / 100);
});

const hasErrors = computed(() => !isRunning.value && errorCount.value > 0);

const label = computed(() => {
  if (!isRunning.value) return t("common.import.a11y.indicatorDone");
  if (isPaused.value) return t("common.import.a11y.indicatorPaused");
  return t("common.import.a11y.indicatorRunning", { current: current.value, total: total.value });
});
</script>
