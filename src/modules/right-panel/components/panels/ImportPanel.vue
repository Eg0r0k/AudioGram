<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      :show-close="true"
      :title="t('common.import.panelTitle')"
      @close="rightPanel.close()"
    />

    <div
      v-if="isRunning"
      class="flex flex-col gap-2 px-4 pb-3"
    >
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-sm font-medium">{{ t("common.import.progressTitle") }}</span>
        <span class="text-xs tabular-nums text-muted-foreground">
          {{ t("common.import.progressLabel", { current, total }) }}
        </span>
      </div>
      <div class="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          :style="{ width: `${progress}%` }"
        />
      </div>
      <p class="truncate text-xs text-muted-foreground">
        {{ runningLine }}
      </p>
      <div class="flex items-center justify-between gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          :aria-label="isPaused ? t('common.import.a11y.resume') : t('common.import.a11y.pause')"
          :disabled="isCancelling"
          @click="togglePause"
        >
          <IconPlay
            v-if="isPaused"
            class="size-4"
          />
          <IconPause
            v-else
            class="size-4"
          />
          {{ isPaused ? t("common.import.resume") : t("common.import.pause") }}
        </Button>
        <Button
          variant="destructive-link"
          size="sm"
          :disabled="isCancelling"
          @click="requestCancel"
        >
          {{ t("common.cancel") }}
        </Button>
      </div>
    </div>

    <div
      v-else-if="successCount > 0"
      class="flex justify-end px-4 pb-3"
    >
      <Button
        variant="ghost-primary"
        size="sm"
        @click="goToLibrary"
      >
        {{ t("common.import.goToLibrary") }}
      </Button>
    </div>

    <Tabs
      v-if="hasFilters"
      v-model="activeFilter"
      class="px-4 pb-2"
    >
      <TabsList class="w-full">
        <TabsTrigger
          v-for="tab in filterTabs"
          :key="tab.key"
          :value="tab.key"
          class="flex-1"
        >
          {{ tab.label }}
          <span class="text-xs text-muted-foreground">{{ tab.count }}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>

    <p
      v-if="visibleFileCount < total"
      class="px-4 pb-2 text-xs text-muted-foreground"
    >
      {{ t("common.import.visibleFiles", { visible: visibleFileCount, total }) }}
    </p>

    <VirtualScrollable
      v-if="filteredFiles.length > 0"
      :items="filteredFiles"
      :item-height="56"
      :padding-top="4"
      :padding-bottom="16"
      class="min-h-0 flex-1"
    >
      <template #default="{ item: file }">
        <Item
          size="sm"
          class="mx-3 h-[52px] flex-nowrap rounded-lg px-2 py-0"
          :class="file.name === processingName ? 'bg-primary/5' : ''"
        >
          <ItemMedia>
            <IconLoader2
              v-if="file.status === 'pending'"
              class="size-5 shrink-0 animate-spin text-muted-foreground"
            />
            <IconCheck
              v-else-if="file.status === 'ok'"
              class="size-5 shrink-0 text-primary"
            />
            <IconMinus
              v-else-if="file.status === 'skipped'"
              class="size-5 shrink-0 text-muted-foreground"
            />
            <IconAlertCircle
              v-else
              class="size-5 shrink-0 text-destructive"
            />
          </ItemMedia>
          <ItemContent class="min-w-0 gap-0.5">
            <ItemTitle class="w-full text-sm font-normal">
              <span class="min-w-0 truncate">{{ file.name }}</span>
            </ItemTitle>
            <ItemSubtitle
              v-if="secondaryLine(file)"
              class="line-clamp-1 text-xs"
              :class="file.status === 'error' ? 'text-destructive' : ''"
            >
              {{ secondaryLine(file) }}
            </ItemSubtitle>
          </ItemContent>
        </Item>
      </template>
    </VirtualScrollable>

    <Empty
      v-else
      class="p-6 py-12 md:p-6 md:py-12"
    >
      <EmptyDescription>{{ t("common.import.empty") }}</EmptyDescription>
    </Empty>

    <Dialog
      :open="isCancelDialogOpen"
      @update:open="handleCancelDialogOpenChange"
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t("common.import.status.cancelTitle") }}</DialogTitle>
          <DialogDescription>{{ t("common.import.status.cancelDescription") }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost-primary"
            :disabled="isCancelling"
            @click="continueImport"
          >
            {{ t("common.import.status.continueImport") }}
          </Button>
          <Button
            variant="destructive-link"
            :disabled="isCancelling"
            @click="confirmCancelImport"
          >
            {{ t("common.import.status.confirmCancel") }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useImport, type ImportFileItem, type ImportFileStatus } from "@/modules/library/composables/useImport";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { routeLocation } from "@/app/router/route-locations";
import { getLogger } from "@/lib/logger";
import IconCheck from "~icons/tabler/check";
import IconMinus from "~icons/tabler/minus";
import IconLoader2 from "~icons/tabler/loader-2";
import IconAlertCircle from "~icons/tabler/alert-circle";
import IconPlay from "~icons/audiogram/play-rounded";
import IconPause from "~icons/audiogram/pause-rounded";

type FilterKey = "all" | "error" | "skipped";

const { t } = useI18n();
const router = useRouter();
const rightPanel = useRightPanelStore();
const {
  isRunning,
  isPaused,
  isCancelling,
  files,
  total,
  current,
  progress,
  visibleFileCount,
  successCount,
  errorCount,
  skippedCount,
  liveCounts,
  closeSheet,
  reset,
  pauseImport,
  resumeImport,
  cancelImport,
} = useImport();

const activeFilter = ref<FilterKey>("all");
const isCancelDialogOpen = ref(false);

const processingName = computed(() =>
  isRunning.value ? files.value[current.value]?.name : undefined,
);

const runningLine = computed(() => {
  if (isCancelling.value) return t("common.import.status.cancelling");
  if (isPaused.value) return t("common.import.status.paused");
  return processingName.value ?? t("common.import.status.running");
});

const hasFilters = computed(() => errorCount.value > 0 || skippedCount.value > 0);

const filterTabs = computed(() => [
  { key: "all" as const, label: t("common.import.filter.all"), count: files.value.length },
  { key: "error" as const, label: t("common.import.filter.errors"), count: liveCounts.value.error },
  { key: "skipped" as const, label: t("common.import.filter.skipped"), count: liveCounts.value.skipped },
]);

const filteredFiles = computed(() => {
  if (activeFilter.value === "all") return files.value;
  const status: ImportFileStatus = activeFilter.value;
  return files.value.filter(f => f.status === status);
});

watch(total, () => {
  activeFilter.value = "all";
});

const secondaryLine = (file: ImportFileItem): string => {
  if (file.status === "error") {
    const key = file.errorCode ? `common.import.errorReason.${file.errorCode}` : "";
    if (key && t(key) !== key) return t(key);
    return t("common.import.errorReason.default");
  }
  if (file.status === "ok" && file.title) {
    return file.artist ? `${file.title} — ${file.artist}` : file.title;
  }
  return "";
};

const togglePause = () => {
  if (isPaused.value) resumeImport();
  else pauseImport();
};

const requestCancel = () => {
  if (isRunning.value && !isPaused.value) pauseImport();
  isCancelDialogOpen.value = true;
};

const handleCancelDialogOpenChange = (open: boolean) => {
  isCancelDialogOpen.value = open;
  if (!open && isRunning.value && !isCancelling.value) resumeImport();
};

const continueImport = () => {
  isCancelDialogOpen.value = false;
  resumeImport();
};

const finish = () => {
  closeSheet();
  reset();
  rightPanel.close();
};

// Leaving the panel after the import finished dismisses the session so the
// ring and menu entry do not outlive the results the user has already seen.
onUnmounted(() => {
  if (isRunning.value) return;
  closeSheet();
  reset();
});

const confirmCancelImport = () => {
  cancelImport();
  isCancelDialogOpen.value = false;
  finish();
};

const goToLibrary = () => {
  finish();
  router.push(routeLocation.allMusic())
    .catch(error => getLogger().error(`[ImportPanel] Navigation to library failed: ${String(error)}`));
};
</script>
