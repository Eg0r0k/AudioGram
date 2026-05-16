<template>
  <div
    ref="rootRef"
    class="relative flex-1 pt-4 h-full flex flex-col min-h-0 overflow-hidden"
  >
    <SidebarHeader />
    <Scrollable
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
          :key="`content-${filter}`"
          :value="filter"
          class="hidden"
        />
      </Tabs>
    </Scrollable>
    <LibraryContextMenu @delete="handleDeleteItem">
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
          />
        </template>
      </VirtualScrollable>
    </LibraryContextMenu>
    <FloatingButton :show="isButtonVisible" />
    <SearchPanel />
  </div>
</template>

<script setup lang="ts">
import SidebarHeader from "@/components/layout/sidebar/header/SidebarHeader.vue";
import FloatingButton from "@/components/layout/sidebar/floatingButton/FloatingButton.vue";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import LibrarySidebarItem from "@/components/layout/sidebar/LibrarySidebarItem.vue";
import Skeleton from "@/components/ui/skeleton/Skeleton.vue";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import SearchPanel from "@/modules/search/components/SearchPanel.vue";
import { LibraryFilter, LibraryItem } from "@/modules/library/types";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { computed, useTemplateRef, ref } from "vue";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import { useSwipeControl } from "@/composables/useSwipeControl";

const {
  pinnedItems,
  unpinnedItems,
  availableFilters,
  isLoading,
  activeFilter,
  setFilter,
  deleteItem,
} = useLibrary();

const handleDeleteItem = async (item: LibraryItem) => {
  await deleteItem(item);
};

const { t } = useI18n();

const scrollableRef = useTemplateRef("scrollableRef");
const rootRef = useTemplateRef<HTMLElement>("rootRef");

const libraryItems = computed(() => [
  ...pinnedItems.value,
  ...unpinnedItems.value,
]);

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

function filterLabel(value: LibraryFilter) {
  return filterLabels.value[value] ?? value;
}

function getLibraryItemKey(index: number) {
  const item = libraryItems.value[index];
  return item ? `${item.type}:${item.id}` : index;
}

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
