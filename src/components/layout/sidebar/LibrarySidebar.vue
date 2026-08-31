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

        <SourceHealthNotice
          :kind="catalogKind"
          class="mx-2 mt-2"
        />

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
      </div>
    </SlideTransition>

    <div
      class="pointer-events-none absolute bottom-[calc(1rem+var(--mobile-bottom-inset,0px))] z-50 flex gap-2"
      :class="isCompact
        ? 'inset-x-0 flex-col items-center'
        : 'inset-x-4 flex-row items-center'"
    >
      <UpdateButton :compact="isCompact" />

      <FloatingButton
        v-if="!activeFolder && !isCatalog"
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
import { computed, inject, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import SlideTransition from "@/components/transitions/SlideTransition.vue";
import CrossfadeTransition from "@/components/transitions/CrossfadeTransition.vue";
import { Button } from "@/components/ui/button";
import FloatingButton from "@/components/layout/sidebar/floatingButton/FloatingButton.vue";
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
import type { LibraryFilter, LibraryItem } from "@/modules/library/types";
import UpdateButton from "@/modules/update/components/UpdateButton.vue";
import IconPlus from "~icons/tabler/plus";
import { useCurrentSourceStore } from "@/modules/sources/store/currentSource.store";
import { useCatalogLibraryItems } from "@/modules/sources/composables/useCatalogLibraryItems";
import { catalogFilters } from "@/modules/sources/lib/catalog-filters";
import SourceHealthNotice from "@/modules/sources/components/SourceHealthNotice.vue";

const {
  pinnedItems,
  unpinnedItems,
  availableFilters,
  isLoading,
  activeFilter,
  folders,
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
  closeFolder,
  deleteSidebarFolder,
  folderDepth,
  folderName,
  folderNameDialogTitle,
  isFolderNameDialogOpen,
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
// router. Inert on desktop: the coordinator only runs in MobileLayout. The
// folder picker is a right-panel view and has its own back handler there.
registerOverlayBackHandler({
  depth: () => folderDepth.value,
  back: closeFolder,
});

const { t } = useI18n();
const isCompact = inject(SIDEBAR_COMPACT_KEY, computed(() => false));
const scrollableRef = useTemplateRef("scrollableRef");
const rootRef = useTemplateRef<HTMLElement>("rootRef");

const currentSourceStore = useCurrentSourceStore();

// Local rows come from Dexie with pinning and folders behind them, catalog
// rows come off the network and have neither. That split is real and stays;
// what it no longer does is name a particular source.
const catalogKind = computed(() =>
  (currentSourceStore.currentSource === "local" ? null : currentSourceStore.currentSource),
);
const isCatalog = computed(() => catalogKind.value !== null);
const catalog = useCatalogLibraryItems(catalogKind, activeFilter);

const localItems = computed(() => activeFolder.value
  ? getFolderItems(activeFolder.value.id)
  : [...pinnedItems.value, ...unpinnedItems.value],
);

const libraryItems = computed(() => (isCatalog.value ? catalog.items.value : localItems.value));
const listLoading = computed(() => (isCatalog.value ? catalog.isLoading.value : isLoading.value));
const visibleFilters = computed(() =>
  (isCatalog.value ? catalogFilters(catalogKind.value) : availableFilters.value),
);

// The one place the tab strip is rendered is the one place its invariant is
// kept: an active tab that is not in the strip leaves no tab highlighted
// above a permanently empty list. Applies to both lists — a local collection
// that emptied out and a source that cannot list the open tab.
watch(visibleFilters, (filters) => {
  if (filters.length > 0 && !filters.includes(activeFilter.value)) setFilter(filters[0]);
}, { immediate: true });

useScrollRestoration(scrollableRef, {
  key: "library-sidebar",
  ready: () => !isLoading.value,
  deps: () => libraryItems.value.length,
});

// The tab strip these swipes drive is only visible at depth 0 — inside a
// folder an unconditional swipe would switch the (hidden) library tabs
// underneath.
// Swipes walk the strip the user can see, not the local library's list: on
// a catalog those two differ, and stepping onto a hidden tab would leave no
// tab highlighted.
const stepFilter = (delta: number) => {
  if (folderDepth.value !== 0) return;
  const filters = visibleFilters.value;
  const next = filters[filters.indexOf(activeFilter.value) + delta] as LibraryFilter | undefined;
  if (next) setFilter(next);
};

useSwipeControl(rootRef, {
  onSwipeLeft: () => stepFilter(1),
  onSwipeRight: () => stepFilter(-1),
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
  return filterLabels.value[value];
}

function filterContentKey(filter: LibraryFilter) {
  return `content-${filter}`;
}

function getLibraryItemKey(index: number) {
  const item = libraryItems.value[index] as (typeof libraryItems.value)[number] | undefined;
  return item ? `${item.type}:${item.id}` : index;
}

const transitionKey = computed(() => (activeFolder.value ? `folder-${activeFolder.value.id}` : "main"));

const isButtonVisible = ref(true);
let lastScrollTop = 0;
const SCROLL_THRESHOLD = 10;
const BOTTOM_THRESHOLD = 30;

function handleScroll(event: Event) {
  const target = event.target as HTMLElement;
  const scrollTop = target.scrollTop;
  const isAtBottom
    = target.scrollHeight - scrollTop - target.clientHeight < BOTTOM_THRESHOLD;

  if (isAtBottom && isCatalog.value) {
    catalog.loadMoreAlbums();
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
