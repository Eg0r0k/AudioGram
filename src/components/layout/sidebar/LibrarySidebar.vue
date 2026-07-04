<template>
  <div
    ref="rootRef"
    class="relative flex-1 pt-4 h-full flex flex-col min-h-0 overflow-hidden"
  >
    <SidebarHeader />

    <SlideTransition :depth="folderDepth">
      <div
        :key="transitionKey"
        class="flex-1 flex flex-col min-h-0 bg-card"
      >
        <LibrarySidebarFolderHeader
          v-if="activeFolder"
          :folder="activeFolder"
          @close="closeFolder"
          @manage="openManageFolderDialog"
          @rename="(name) => renameFolder(activeFolder!.id, name)"
        />

        <Scrollable
          v-else
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
                v-for="filter in availableFilters"
                :key="filter"
                :value="filter"
                class="text-base font-medium mb-0.5"
              >
                {{ filterLabel(filter) }}
              </TabsTrigger>
            </TabsList>
            <TabsContent
              v-for="filter in availableFilters"
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
          @manage-folder="openManageFolderDialog"
          @rename-folder="openRenameFolderDialog"
          @move-to-folder="openMoveToFolderDialog"
          @remove-from-folder="removeItemFromActiveFolder"
        >
          <div
            v-if="isLoading"
            class="flex-1 gap-2 flex flex-col p-2"
          >
            <div
              v-for="i in 20"
              :key="i"
              class="flex items-center gap-3 px-2"
            >
              <Skeleton class="size-[54px] rounded-full shrink-0" />
              <div class="flex flex-col gap-2 w-full">
                <Skeleton class="h-3 w-[40%]" />
                <Skeleton class="h-3 w-[65%]" />
              </div>
            </div>
          </div>

          <VirtualScrollable
            v-else
            ref="scrollableRef"
            :padding-top="8"
            :padding-bottom="8"
            :items="libraryItems"
            :item-height="72"
            :get-item-key="getLibraryItemKey"
            class="flex-1"
            @scroll="handleScroll"
          >
            <template #default="{ item }">
              <LibrarySidebarItem
                class="mx-2"
                :item="item"
                @open-folder="openFolder"
              />
            </template>
          </VirtualScrollable>
        </LibraryContextMenu>
      </div>
    </SlideTransition>

    <FloatingButton
      v-if="!activeFolder"
      :show="isButtonVisible"
      @create-folder="openCreateFolderDialog"
    />

    <FloatingActionButton
      v-else
      :show="isButtonVisible"
    >
      <Button
        class="size-12 rounded-full shadow-lg"
        @click="openManageFolderDialog(activeFolder.id)"
      >
        <IconPlus class="size-6" />
      </Button>
    </FloatingActionButton>

    <SearchPanel />

    <LibraryFolderNameDialog
      v-model:open="isFolderNameDialogOpen"
      v-model:name="folderName"
      :title="folderNameDialogTitle"
      @submit="submitFolderName"
    />

    <LibraryFolderItemsDialog
      v-model:open="isManageFolderDialogOpen"
      v-model:selected-keys="selectedFolderItemKeys"
      :items="movableItems"
      @save="submitManageFolder"
    />

    <LibraryMoveToFolderDialog
      v-model:open="isMoveToFolderDialogOpen"
      :folders="folders"
      :item="itemToMove"
      @move="moveItemToFolder"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import FloatingActionButton from "@/components/common/FloatingActionButton.vue";
import SlideTransition from "@/components/transitions/SlideTransition.vue";
import { Button } from "@/components/ui/button";
import FloatingButton from "@/components/layout/sidebar/floatingButton/FloatingButton.vue";
import LibraryFolderItemsDialog from "@/components/layout/sidebar/LibraryFolderItemsDialog.vue";
import LibraryFolderNameDialog from "@/components/layout/sidebar/LibraryFolderNameDialog.vue";
import LibraryMoveToFolderDialog from "@/components/layout/sidebar/LibraryMoveToFolderDialog.vue";
import LibrarySidebarFolderHeader from "@/components/layout/sidebar/LibrarySidebarFolderHeader.vue";
import LibrarySidebarItem from "@/components/layout/sidebar/LibrarySidebarItem.vue";
import SidebarHeader from "@/components/layout/sidebar/header/SidebarHeader.vue";
import { useLibrarySidebarFolders } from "@/components/layout/sidebar/useLibrarySidebarFolders";
import { Scrollable } from "@/components/ui/scrollable";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import Skeleton from "@/components/ui/skeleton/Skeleton.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSwipeControl } from "@/composables/useSwipeControl";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import type { LibraryFilter, LibraryItem } from "@/modules/library/types";
import SearchPanel from "@/modules/search/components/SearchPanel.vue";
import IconPlus from "~icons/tabler/plus";

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
  closeFolder,
  deleteSidebarFolder,
  folderName,
  folderNameDialogTitle,
  isFolderNameDialogOpen,
  isManageFolderDialogOpen,
  isMoveToFolderDialogOpen,
  itemToMove,
  moveItemToFolder,
  openCreateFolderDialog,
  openFolder,
  openManageFolderDialog,
  openMoveToFolderDialog,
  openRenameFolderDialog,
  removeItemFromActiveFolder,
  selectedFolderItemKeys,
  submitFolderName,
  submitManageFolder,
} = useLibrarySidebarFolders({
  folders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderItems,
});

const { t } = useI18n();
const scrollableRef = useTemplateRef("scrollableRef");
const rootRef = useTemplateRef<HTMLElement>("rootRef");

const libraryItems = computed(() => activeFolder.value
  ? getFolderItems(activeFolder.value.id)
  : [...pinnedItems.value, ...unpinnedItems.value],
);

useScrollRestoration(scrollableRef, {
  key: "library-sidebar",
  ready: () => !isLoading.value,
  deps: () => libraryItems.value.length,
});

useSwipeControl(rootRef, {
  onSwipeLeft: () => {
    const idx = availableFilters.value.indexOf(activeFilter.value);
    const next = availableFilters.value[idx + 1];
    if (next) setFilter(next);
  },
  onSwipeRight: () => {
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

const folderDepth = computed(() => activeFolder.value ? 1 : 0);
const transitionKey = computed(() => activeFolder.value ? `folder-${activeFolder.value.id}` : "main");

const isButtonVisible = ref(true);
let lastScrollTop = 0;
const SCROLL_THRESHOLD = 10;
const BOTTOM_THRESHOLD = 30;

function handleScroll(event: Event) {
  const target = event.target as HTMLElement;
  const scrollTop = target.scrollTop;
  const isAtBottom
    = target.scrollHeight - scrollTop - target.clientHeight < BOTTOM_THRESHOLD;

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
