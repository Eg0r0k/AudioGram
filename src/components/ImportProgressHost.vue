<template>
  <Teleport to="body">
    <Transition name="import-pill">
      <section
        v-if="isOpen"
        class="import-pill min-h-0 fixed flex flex-col overflow-hidden bg-popover"
        :class="containerClass"
        :style="containerStyle"
        :aria-label="t('common.import.a11y.region')"
      >
        <button
          type="button"
          class="flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-2"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          <span class="flex size-8 shrink-0 items-center justify-center">
            <IconLoader2
              v-if="isRunning"
              class="size-5 animate-spin text-primary"
            />
            <IconAlertCircle
              v-else-if="errorCountLive > 0"
              class="size-5 text-destructive"
            />
            <IconCheck
              v-else
              class="size-5 text-primary"
            />
          </span>

          <span class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-sm font-medium">
              {{ isRunning
                ? t("common.import.progressLabel", { current, total })
                : t("common.import.doneTitle") }}
            </span>
            <span
              v-if="headerSubtitle"
              class="truncate text-xs text-muted-foreground"
            >
              {{ headerSubtitle }}
            </span>
          </span>

          <component
            :is="expanded ? IconChevronDown : IconChevronUp"
            class="size-4 shrink-0 text-muted-foreground"
          />
        </button>

        <div
          v-if="isRunning"
          class="h-1 w-full bg-muted"
        >
          <div
            class="h-full bg-primary transition-[width] duration-300 ease-out"
            :style="{ width: `${progress}%` }"
          />
        </div>

        <template v-if="expanded">
          <Separator />

          <div
            v-if="hasFilters"
            class="flex gap-1 px-3.5 py-2.5 "
          >
            <button
              v-for="tab in filterTabs"
              :key="tab.key"
              type="button"
              class="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              :class="activeFilter === tab.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent'"
              @click="activeFilter = tab.key"
            >
              {{ tab.label }} ({{ tab.count }})
            </button>
          </div>

          <Separator />

          <div
            v-if="visibleFileCount < total"
            class="px-3.5 pt-2 text-xs text-muted-foreground"
          >
            {{ t("common.import.visibleFiles", { visible: visibleFileCount, total }) }}
          </div>

          <VirtualScrollable
            v-if="filteredFiles.length > 0"
            :items="filteredFiles"
            :item-height="56"
            :padding-top="6"
            :padding-bottom="6"
            class="shrink-0"
            :style="{ height: `${listHeight}px` }"
          >
            <template #default="{ item: file }">
              <Item
                :key="file.name"
                size="sm"
                class="mx-2 h-[52px] flex-nowrap py-0"
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
                  <ItemTitle class="w-full min-w-0 gap-2 text-sm">
                    <span class="min-w-0 truncate">{{ file.name }}</span>
                    <span
                      v-if="fileFormat(file.name)"
                      class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground"
                    >
                      {{ fileFormat(file.name) }}
                    </span>
                  </ItemTitle>
                  <ItemDescription
                    v-if="secondaryLine(file)"
                    class="line-clamp-1 text-xs"
                    :class="file.status === 'error' ? 'text-destructive' : ''"
                  >
                    {{ secondaryLine(file) }}
                  </ItemDescription>
                </ItemContent>
              </Item>
            </template>
          </VirtualScrollable>

          <p
            v-else
            class="px-3.5 py-6 text-center text-xs text-muted-foreground"
          >
            {{ t("common.import.empty") }}
          </p>
        </template>

        <Separator />

        <!-- Action row -->
        <div class="flex items-center gap-2 px-3 py-2.5">
          <template v-if="isRunning">
            <Button
              size="icon-sm"
              variant="ghost"
              :aria-label="isPaused ? t('common.import.a11y.resume') : t('common.import.a11y.pause')"
              :disabled="isCancelling"
              @click="togglePause"
            >
              <IconPlayerPlay
                v-if="isPaused"
                class="size-4"
              />
              <IconPlayerPause
                v-else
                class="size-4"
              />
            </Button>
            <span class="flex-1 text-xs text-muted-foreground">
              {{ isCancelling
                ? t("common.import.status.cancelling")
                : isPaused
                  ? t("common.import.status.paused")
                  : t("common.import.status.running") }}
            </span>
            <Button
              size="sm"
              variant="destructive-link"
              :disabled="isCancelling"
              @click="requestCancel"
            >
              {{ t("common.cancel") }}
            </Button>
          </template>

          <template v-else>
            <Button
              size="sm"
              variant="destructive-link"
              :class="successCountLive > 0 ? '' : 'flex-1'"
              @click="handleClose"
            >
              {{ t("common.close") }}
            </Button>
            <Button
              v-if="successCountLive > 0"
              class="flex-1"
              size="sm"
              variant="ghost-primary"
              @click="goToLibrary"
            >
              {{ t("common.import.goToLibrary") }}
            </Button>
          </template>
        </div>
      </section>
    </Transition>
  </Teleport>

  <Dialog
    :open="isCancelDialogOpen"
    @update:open="handleCancelDialogOpenChange"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {{ t("common.import.status.cancelTitle") }}
        </DialogTitle>
        <DialogDescription>
          {{ t("common.import.status.cancelDescription") }}
        </DialogDescription>
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
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useImport, type ImportFileItem, type ImportFileStatus } from "@/modules/library/composables/useImport";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import { routeLocation } from "@/app/router/route-locations";
import { useDeviceLayout } from "@/composables/useDeviceLayout";
import { usePlayerStore } from "@/modules/player";
import IconCheck from "~icons/tabler/check";
import IconMinus from "~icons/tabler/minus";
import IconLoader2 from "~icons/tabler/loader-2";
import IconAlertCircle from "~icons/tabler/alert-circle";
import IconChevronUp from "~icons/tabler/chevron-up";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconPlayerPause from "~icons/tabler/player-pause";
import IconPlayerPlay from "~icons/tabler/player-play";

type FilterKey = "all" | "error" | "skipped";

const { t } = useI18n();
const router = useRouter();
const {
  isOpen,
  isRunning,
  isPaused,
  isCancelling,
  files,
  total,
  current,
  progress,
  visibleFileCount,
  closeSheet,
  reset,
  pauseImport,
  resumeImport,
  cancelImport,
} = useImport();

const expanded = ref(false);
const activeFilter = ref<FilterKey>("all");
const isCancelDialogOpen = ref(false);

const { isMobileLayout } = useDeviceLayout();
const playerStore = usePlayerStore();

// MiniPlayer (h-14 + my-1) occupies the bottom of the mobile column when a
// track is loaded; dock the import surface just above it, clear of the notch.
const MINI_PLAYER_OFFSET = "4.75rem";

const containerClass = computed(() =>
  isMobileLayout.value ? "rounded-t-2xl z-30" : "rounded-xl z-40",
);

const containerStyle = computed(() => {
  if (isMobileLayout.value) {
    const player = playerStore.currentTrack ? MINI_PLAYER_OFFSET : "0px";
    return {
      left: "calc(env(safe-area-inset-left, 0px) + 0.5rem)",
      right: "calc(env(safe-area-inset-right, 0px) + 0.5rem)",
      bottom: `calc(env(safe-area-inset-bottom, 0px) + ${player} + 0.5rem)`,
      maxHeight: "min(75dvh, 620px)",
    };
  }
  return {
    right: "1rem",
    bottom: "1rem",
    width: "380px",
    maxWidth: "calc(100vw - 2rem)",
    maxHeight: "min(70vh, 560px)",
  };
});

const successCountLive = computed(() => countBy("ok"));
const errorCountLive = computed(() => countBy("error"));
const skippedCountLive = computed(() => countBy("skipped"));

function countBy(status: ImportFileStatus): number {
  return files.value.reduce((acc, f) => acc + (f.status === status ? 1 : 0), 0);
}

const processingName = computed(() =>
  isRunning.value ? files.value[current.value]?.name : undefined,
);

const headerSubtitle = computed(() => {
  if (isRunning.value) {
    return processingName.value ?? t("common.import.status.running");
  }
  // Expanded view already breaks counts down via the filter chips вЂ” don't repeat.
  if (expanded.value && (errorCountLive.value > 0 || skippedCountLive.value > 0)) {
    return "";
  }
  return t("common.import.summary", {
    imported: successCountLive.value,
    failed: errorCountLive.value,
    skipped: skippedCountLive.value,
  });
});

const hasFilters = computed(() => errorCountLive.value > 0 || skippedCountLive.value > 0);

const filterTabs = computed(() => [
  { key: "all" as const, label: t("common.import.filter.all"), count: files.value.length },
  { key: "error" as const, label: t("common.import.filter.errors"), count: errorCountLive.value },
  { key: "skipped" as const, label: t("common.import.filter.skipped"), count: skippedCountLive.value },
]);

const filteredFiles = computed(() => {
  if (activeFilter.value === "all") return files.value;
  return files.value.filter(f => f.status === activeFilter.value);
});

const listHeight = computed(() =>
  Math.min(Math.max(filteredFiles.value.length, 1) * 56 + 12, 300),
);

// Reset the filter back to a valid tab when filters disappear (e.g. new import).
watch(hasFilters, (has) => {
  if (!has) activeFilter.value = "all";
});
// Collapse when the surface is dismissed so the next import starts compact.
watch(isOpen, (open) => {
  if (!open) {
    expanded.value = false;
    activeFilter.value = "all";
  }
});

function fileFormat(name: string): string {
  const ext = name.split(".").pop();
  if (!ext || ext === name) return "";
  return ext.toUpperCase();
}

function secondaryLine(file: ImportFileItem): string {
  if (file.status === "error") {
    const key = file.errorCode ? `common.import.errorReason.${file.errorCode}` : "";
    if (key && t(key) !== key) return t(key);
    return t("common.import.errorReason.default");
  }
  if (file.status === "ok" && file.title) {
    return file.artist ? `${file.title} — ${file.artist}` : file.title;
  }
  return "";
}

function togglePause() {
  if (isPaused.value) resumeImport();
  else pauseImport();
}

function requestCancel() {
  if (isRunning.value && !isPaused.value) pauseImport();
  isCancelDialogOpen.value = true;
}

function handleCancelDialogOpenChange(open: boolean) {
  isCancelDialogOpen.value = open;
  if (!open && isRunning.value && !isCancelling.value) {
    resumeImport();
  }
}

function continueImport() {
  isCancelDialogOpen.value = false;
  resumeImport();
}

async function confirmCancelImport() {
  await cancelImport();
  isCancelDialogOpen.value = false;
  handleClose();
}

function handleClose() {
  closeSheet();
  reset();
}

function goToLibrary() {
  closeSheet();
  reset();
  router.push(routeLocation.allMusic());
}
</script>

<style scoped>
.import-pill-enter-active,
.import-pill-leave-active {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease;
}

.import-pill-enter-from,
.import-pill-leave-to {
  transform: translateY(0.75rem);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .import-pill-enter-active,
  .import-pill-leave-active {
    transition-duration: 80ms;
  }

  .import-pill-enter-from,
  .import-pill-leave-to {
    transform: none;
  }
}
</style>
