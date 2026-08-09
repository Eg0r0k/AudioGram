<template>
  <AnimatePresence>
    <Motion
      v-if="isPending"
      :initial="{ opacity: 0, scale: 0.9, y: 20 }"
      :animate="{ opacity: 1, scale: 1, y: 0 }"
      :exit="{ opacity: 0, scale: 0.9, y: 20 }"
      :transition="prefersReduced ? { duration: 0.1 } : { type: 'spring', stiffness: 300, damping: 25 }"
      class="pointer-events-auto min-w-0"
      :class="compact ? 'shrink-0' : 'flex-1'"
    >
      <Button
        class="h-12 min-w-0 rounded-full shadow-lg"
        :class="compact ? 'w-12 px-0' : 'w-full px-4'"
        :disabled="isBusy"
        :title="compact ? label : store.error?.message"
        :aria-label="label"
        @click="handleClick"
      >
        <IconLoader2
          v-if="isBusy"
          class="size-5 animate-spin"
        />
        <IconRefreshAlert
          v-else-if="isError"
          class="size-5"
        />
        <IconDownload
          v-else
          class="size-5"
        />

        <span
          v-if="!compact"
          class="truncate"
        >{{ label }}</span>
      </Button>
    </Motion>
  </AnimatePresence>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { AnimatePresence, Motion, useReducedMotion } from "motion-v";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "../store/update.store";
import IconDownload from "~icons/tabler/download";
import IconLoader2 from "~icons/tabler/loader-2";
import IconRefreshAlert from "~icons/tabler/refresh-alert";

defineProps<{
  /** Narrow sidebar: drops the label and matches the action button's square. */
  compact?: boolean;
}>();

const { t } = useI18n();
const store = useUpdateStore();
const prefersReduced = useReducedMotion();

const isError = computed(() => store.status === "error");
const isBusy = computed(() => store.isDownloading || store.isInstalling);

/**
 * Stays put until the update is actually applied — a pending update is not
 * something the user should be able to lose track of. "checking" and
 * "up-to-date" deliberately do not show it.
 */
const isPending = computed(
  () => store.isUpdateAvailable || isBusy.value || isError.value,
);

const label = computed(() => {
  if (store.isInstalling) return t("update.installing");
  if (store.isDownloading) {
    const percent = store.downloadPercent;
    return percent === null
      ? t("update.downloading")
      : t("update.downloadingPercent", { percent });
  }
  if (isError.value) return t("update.retry");

  const version = store.updateInfo?.version;
  return version ? t("update.updateTo", { version }) : t("update.updateAvailable");
});

function handleClick() {
  // A failed attempt needs a fresh check before the install path reopens.
  if (isError.value) {
    store.check();
    return;
  }
  store.apply();
}
</script>
