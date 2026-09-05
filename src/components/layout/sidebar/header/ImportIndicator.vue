<template>
  <AnimatePresence :initial="false">
    <Motion
      v-if="isOpen"
      key="import-indicator"
      class="shrink-0 overflow-hidden"
      :initial="{ width: 0, opacity: 0, marginLeft: '-0.75rem' }"
      :animate="{ width: 'auto', opacity: 1, marginLeft: '0rem' }"
      :exit="{ width: 0, opacity: 0, marginLeft: '-0.75rem' }"
      :transition="transition"
    >
      <Button
        variant="ghost"
        size="icon-lg"
        class="relative rounded-full"
        :aria-label="label"
        @click="rightPanel.openImport()"
      >
        <svg
          class="absolute inset-0.5 size-9 -rotate-90"
          viewBox="0 0 36 36"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="text-muted"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
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
        <component
          :is="icon"
          class="size-4"
        />
        <span
          v-if="hasErrors"
          class="absolute right-1 top-1 size-1.5 rounded-full bg-destructive"
          data-testid="import-error-dot"
        />
      </Button>
    </Motion>
  </AnimatePresence>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { AnimatePresence, Motion, useReducedMotion } from "motion-v";
import { Button } from "@/components/ui/button";
import { useImport } from "@/modules/library/composables/useImport";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import IconFileImport from "~icons/tabler/file-import";
import IconPlayerPause from "~icons/tabler/player-pause";
import IconCheck from "~icons/tabler/check";

const CIRCUMFERENCE = 2 * Math.PI * 15;

const { t } = useI18n();
const rightPanel = useRightPanelStore();
const prefersReduced = useReducedMotion();
const { isOpen, isRunning, isPaused, progress, current, total, errorCount } = useImport();

const transition = computed(() =>
  prefersReduced.value
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const },
);

const dashOffset = computed(() => {
  const percent = isRunning.value ? progress.value : 100;
  return CIRCUMFERENCE * (1 - percent / 100);
});

const hasErrors = computed(() => !isRunning.value && errorCount.value > 0);

const icon = computed(() => {
  if (!isRunning.value) return IconCheck;
  return isPaused.value ? IconPlayerPause : IconFileImport;
});

const label = computed(() => {
  if (!isRunning.value) return t("common.import.a11y.indicatorDone");
  if (isPaused.value) return t("common.import.a11y.indicatorPaused");
  return t("common.import.a11y.indicatorRunning", { current: current.value, total: total.value });
});
</script>
