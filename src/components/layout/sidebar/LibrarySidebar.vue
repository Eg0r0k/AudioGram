<template>
  <div
    ref="rootRef"
    class="relative flex-1 pt-4 h-full flex flex-col min-h-0 overflow-hidden"
  >
    <SidebarHeader :compact="isCompact" />

    <SlideTransition :depth="folderDepth">
      <div
        :key="transitionKey"
        class="flex-1 flex flex-col min-h-0 bg-card"
      >
        <LibraryFolderAddPanel
          v-if="activeFolder && isFolderPickerOpen"
          :folder="activeFolder"
          :items="pickerItems"
          @confirm="addItemsToActiveFolder"
          @back="closeFolderPicker"
        />

        <template v-else>
          <LibrarySidebarFolderHeader
            v-if="activeFolder"
            :folder="activeFolder"
            :compact="isCompact"
            @close="closeFolder"
            @rename="renameActiveFolder"
          />

          <Scrollable
            v-else-if="!isCompact"
            direction="horizontal"
            hide-thumb
            class="shrink-0 border-b dark:border-background border-border"
          >
            <Tabs
              :model-value="activeFilter"
              @update:model-value="setFilter($event as LibraryFilter)"
            >
              <TabsList class="inline-flex items-center gap-0 px-4">
                <TabsTrigger
                  v-for="filter in visibleFilters"
                  :key="filter"
                  :value="filter"
                  class="text-base font-medium mb-0.5"
                >
                  {{ filterLabel(filter) }}
                </TabsTrigger>
              </TabsList>
              <TabsContent
                v-for="filter in visibleFilters"
                :key="filterContentKey(filter)"
                :value="filter"
                class="hidden"
              />
            </Tabs>
          </Scrollable>

          <LibraryContextMenu
            :inside-folder="!!activeFolder"
            @delete="handleDeleteItem"
            @open-folder="openFolder"
            @add-to-folder="openFolderPicker"
            @rename-folder="openRenameFolderDialog"
            @remove-from-folder="removeItemFromActiveFolder"
          >
            <CrossfadeTransition class="flex-1">
              <div
                v-if="listLoading"
                class="flex flex-col gap-2 overflow-hidden p-2"
              >
                <div
                  v-for="i in 20"
                  :key="i"
                  class="flex items-center gap-3 px-2"
                  :class="isCompact && 'justify-center'"
                >
                  <Skeleton class="size-[54px] rounded-full shrink-0" />
                  <div
                    v-if="!isCompact"
                    class="flex flex-col gap-2 w-full"
                  >
                    <Skeleton class="h-3 w-[40%]" />
                    <Skeleton class="h-3 w-[65%]" />
                  </div>
                </div>
              </div>

              <VirtualScrollable
                v-else
                ref="scrollableRef"
                hide-thumb
                :padding-top="8"
                :padding-bottom="8"
                :items="libraryItems"
                :item-height="72"
                :get-item-key="getLibraryItemKey"
                animate-reorder
                @scroll="handleScroll"
              >
                <template #default="{ item }">
                  <LibrarySidebarItem
                    :class="isCompact ? 'mx-1' : 'mx-2'"
                    :item="item"
                    :compact="isCompact"
                    @open-folder="openFolder"
                  />
                </template>
              </VirtualScrollable>
            </CrossfadeTransition>
          </LibraryContextMenu>
        </template>
      </div>
    </SlideTransition>

    <div
      v-if="!isFolderPickerOpen"
      class="pointer-events-none absolute bottom-[calc(1rem+var(--mobile-bottom-inset,0px))] z-50 flex gap-2"
      :class="isCompact
        ? 'inset-x-0 flex-col items-center'
        : 'inset-x-4 flex-row items-center'"
    >
      <UpdateButton :compact="isCompact" />

      <FloatingButton
        v-if="!activeFolder && !isNdSource"
        inline
        class="pointer-events-auto"
        :class="!isCompact && 'ml-auto'"
        :show="isButtonVisible"
        @create-folder="openCreateFolderDialog"
      />

      <FloatingActionButton
        v-else-if="activeFolder"
        inline
        class="pointer-events-auto"
        :class="!isCompact && 'ml-auto'"
        :show="isButtonVisible"
      >
        <Button
          class="size-12 rounded-full shadow-lg"
          @click="openFolderPicker(activeFolder.id)"
        >
          <IconPlus class="size-6" />
        </Button>
      </FloatingActionButton>
    </div>

    <SearchPanel />

    <LibraryFolderNameDialog
      v-model:open="isFolderNameDialogOpen"
      :initial-name="folderName"
      :title="folderNameDialogTitle"
      @submit="submitFolderName"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import SlideTransition from "@/components/transitions/SlideTransition.vue";
import CrossfadeTransition from "@/components/transitions/CrossfadeTransition.vue";
import { Button } from "@/components/ui/button";
import FloatingButton from "@/components/layout/sidebar/floatingButton/FloatingButton.vue";
import LibraryFolderAddPanel from "@/components/layout/sidebar/LibraryFolderAddPanel.vue";
import LibraryFolderNameDialog from "@/components/layout/sidebar/LibraryFolderNameDialog.vue";
import LibrarySidebarFolderHeader from "@/components/layout/sidebar/LibrarySidebarFolderHeader.vue";
import LibrarySidebarItem from "@/components/layout/sidebar/library-item/LibrarySidebarItem.vue";
import SearchPanel from "@/modules/search/components/SearchPanel.vue";
import SidebarHeader from "@/components/layout/sidebar/header/SidebarHeader.vue";
import { SIDEBAR_COMPACT_KEY } from "@/components/layout/sidebar/sidebarCompact";
import { useLibrarySidebarFolders } from "@/components/layout/sidebar/useLibrarySidebarFolders";
import { Scrollable } from "@/components/ui/scrollable";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import Skeleton from "@/components/ui/skeleton/Skeleton.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { registerOverlayBackHandler } from "@/composables/useOverlayBackButton";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import { buildFolderPickerItems } from "@/modules/library/lib/folderPicker";
import type { LibraryFilter, LibraryItem } from "@/modules/library/types";
import UpdateButton from "@/modules/update/components/UpdateButton.vue";
import IconPlus from "~icons/tabler/plus";
import { useCurrentSourceStore } from "@/modules/sources/store/currentSource.store";
import { useNdLibraryItems } from "@/modules/sources/composables/useNdLibraryItems";
import { LIBRARY_FILTERS } from "@/modules/library/types";

const {
  pinnedItems,
  unpinnedItems,
  availableFilters,
  isLoading,
  activeFilter,
  folders,
  movableItems,
  setFilter,
  deleteItem,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderItems,
  getFolderItems,
} = useLibrary();

const {
  activeFolder,
  addItemsToActiveFolder,
  closeFolder,
  closeFolderPicker,
  deleteSidebarFolder,
  folderDepth,
  folderName,
  folderNameDialogTitle,
  isFolderNameDialogOpen,
  isFolderPickerOpen,
  openCreateFolderDialog,
  openFolder,
  openFolderPicker,
  openRenameFolderDialog,
  removeItemFromActiveFolder,
  renameActiveFolder,
  submitFolderName,
} = useLibrarySidebarFolders({
  folders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderItems,
});

// Hardware back leaves an open sidebar folder before falling through to the
// router. Inert on desktop: the coordinator only runs in MobileLayout.
registerOverlayBackHandler({
  depth: () => folderDepth.value,
  back: () => {
    if (isFolderPickerOpen.value) closeFolderPicker();
    else closeFolder();
  },
});

const { t } = useI18n();
const isCompact = inject(SIDEBAR_COMPACT_KEY, computed(() => false));
const scrollableRef = useTemplateRef("scrollableRef");
const rootRef = useTemplateRef<HTMLElement>("rootRef");

const currentSourceStore = useCurrentSourceStore();
const isNdSource = computed(() => currentSourceStore.currentSource === "nd");
const ndLibrary = useNdLibraryItems(activeFilter);

const localItems = computed(() => activeFolder.value
  ? getFolderItems(activeFolder.value.id)
  : [...pinnedItems.value, ...unpinnedItems.value],
);

const libraryItems = computed(() => (isNdSource.value ? ndLibrary.items.value : localItems.value));
const listLoading = computed(() => (isNdSource.value ? ndLibrary.isLoading.value : isLoading.value));
const visibleFilters = computed(() => (isNdSource.value ? [...LIBRARY_FILTERS] : availableFilters.value));

useScrollRestoration(scrollableRef, {
  key: "library-sidebar",
  ready: () => !isLoading.value,
  deps: () => libraryItems.value.length,
});

// The tab strip these swipes drive is only visible at depth 0 — inside a
// folder or the folder picker, `rootRef` also wraps the picker's horizontal
// chip scroller and rows, so an unconditional swipe would hijack their
// gestures and switch the (hidden) library tabs underneath.
useSwipeControl(rootRef, {
  onSwipeLeft: () => {
    if (folderDepth.value !== 0) return;
    const idx = availableFilters.value.indexOf(activeFilter.value);
    const next = availableFilters.value[idx + 1];
    if (next) setFilter(next);
  },
  onSwipeRight: () => {
    if (folderDepth.value !== 0) return;
    const idx = availableFilters.value.indexOf(activeFilter.value);
    const prev = availableFilters.value[idx - 1];
    if (prev) setFilter(prev);
  },
});

const filterLabels = computed<Record<LibraryFilter, string>>(() => ({
  all: t("library.filterAll"),
  playlist: t("library.filterPlaylists"),
  artist: t("library.filterArtists"),
  album: t("library.filterAlbums"),
}));

async function handleDeleteItem(item: LibraryItem) {
  if (item.type === "folder") {
    await deleteSidebarFolder(item.id);
    return;
  }

  await deleteItem(item);
}

function filterLabel(value: LibraryFilter) {
  return filterLabels.value[value] ?? value;
}

function filterContentKey(filter: LibraryFilter) {
  return `content-${filter}`;
}

function getLibraryItemKey(index: number) {
  const item = libraryItems.value[index];
  return item ? `${item.type}:${item.id}` : index;
}

const transitionKey = computed(() => {
  if (!activeFolder.value) return "main";
  return isFolderPickerOpen.value ? `picker-${activeFolder.value.id}` : `folder-${activeFolder.value.id}`;
});

const pickerItems = computed(() => activeFolder.value
  ? buildFolderPickerItems(movableItems.value, folders.value, activeFolder.value.id)
  : []);

const isButtonVisible = ref(true);
let lastScrollTop = 0;
const SCROLL_THRESHOLD = 10;
const BOTTOM_THRESHOLD = 30;

function handleScroll(event: Event) {
  const target = event.target as HTMLElement;
  const scrollTop = target.scrollTop;
  const isAtBottom
    = target.scrollHeight - scrollTop - target.clientHeight < BOTTOM_THRESHOLD;

  if (isAtBottom && isNdSource.value) {
    ndLibrary.loadMoreAlbums();
  }

  if (scrollTop < 50 || isAtBottom) {
    isButtonVisible.value = true;
    lastScrollTop = scrollTop;
    return;
  }

  const diff = scrollTop - lastScrollTop;

  if (diff > SCROLL_THRESHOLD && isButtonVisible.value) {
    isButtonVisible.value = false;
  }
  else if (diff < -SCROLL_THRESHOLD && !isButtonVisible.value) {
    isButtonVisible.value = true;
  }

  lastScrollTop = scrollTop;
}
</script>
