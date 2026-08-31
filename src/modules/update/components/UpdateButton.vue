<template>
  <FloatingActionButton
    :show="isPending"
    inline
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
      <MorphIcon
        :icon="statusIcon"
        spring="snappy"
        reduced-motion="user"
        class="size-5"
        :class="{ 'animate-spin': isBusy }"
      />

      <span
        v-if="!compact"
        class="truncate"
      >{{ label }}</span>
    </Button>
  </FloatingActionButton>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { MorphIcon } from "morphicons/vue";
import { svgToIcon } from "morphicons/adapters";
import { Button } from "@/components/ui/button";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import { useUpdateStore } from "../store/update.store";
import { getLogger } from "@/lib/logger";
import downloadRaw from "~icons/tabler/download?raw";
import loaderRaw from "~icons/tabler/loader-2?raw";
import refreshAlertRaw from "~icons/tabler/refresh-alert?raw";

defineProps<{
  compact?: boolean;
}>();

const { t } = useI18n();
const store = useUpdateStore();

const isError = computed(() => store.status === "error");
const isBusy = computed(() => store.isDownloading || store.isInstalling);

const isPending = computed(
  () => store.isUpdateAvailable || isBusy.value || isError.value,
);

const statusIcons = {
  busy: svgToIcon(loaderRaw),
  error: svgToIcon(refreshAlertRaw),
  idle: svgToIcon(downloadRaw),
};
const statusIcon = computed(() => {
  if (isBusy.value) return statusIcons.busy;
  if (isError.value) return statusIcons.error;
  return statusIcons.idle;
});

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
  if (isError.value) {
    store.check().catch((error: unknown) => getLogger().error(`[Update] Check failed: ${String(error)}`));
    return;
  }
  store.apply().catch((error: unknown) => getLogger().error(`[Update] Apply failed: ${String(error)}`));
}
</script>
