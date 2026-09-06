<template>
  <Transition name="import-ring">
    <span
      v-if="isOpen"
      class="pointer-events-none absolute inset-0"
    >
      <svg
        class="absolute inset-0 size-10 -rotate-90"
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
      <Transition name="import-dot">
        <span
          v-if="hasErrors"
          class="absolute right-0 top-0 size-2 rounded-full bg-destructive ring-2 ring-background"
          data-testid="import-error-dot"
        />
      </Transition>
      <span class="sr-only">{{ label }}</span>
    </span>
  </Transition>
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

<style scoped>
.import-ring-enter-active,
.import-ring-leave-active,
.import-dot-enter-active,
.import-dot-leave-active {
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.import-ring-enter-from,
.import-ring-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.import-dot-enter-from,
.import-dot-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

@media (prefers-reduced-motion: reduce) {
  .import-ring-enter-active,
  .import-ring-leave-active,
  .import-dot-enter-active,
  .import-dot-leave-active {
    transition-duration: 80ms;
  }

  .import-ring-enter-from,
  .import-ring-leave-to,
  .import-dot-enter-from,
  .import-dot-leave-to {
    transform: none;
  }
}
</style>
