<template>
  <EntitySelectPanel
    ref="panelRef"
    v-model:search="search"
    :title="title"
    :items="visibleItems"
    :get-key="libraryItemKey"
    :confirm-count="selectedCount"
    :show-back="rightPanel.depth > 0"
    header-class="pt-0! min-h-0!"
    @confirm="handleConfirm"
    @back="rightPanel.back()"
    @close="rightPanel.close()"
  >
    <template #before-list>
      <Scrollable
        v-if="items.length > 0"
        direction="horizontal"
        hide-thumb
        class="shrink-0 border-b dark:border-background border-border"
      >
        <Tabs
          :model-value="filter"
          @update:model-value="filter = $event as FolderPickerFilter"
        >
          <TabsList class="inline-flex items-center gap-0 px-4">
            <TabsTrigger
              v-for="chip in chips"
              :key="chip.value"
              :value="chip.value"
              class="text-base font-medium mb-0.5 gap-1.5"
            >
              <span>{{ chip.label }}</span>
              <Badge
                variant="secondary"
                size="md"
                class="h-5 min-w-5 px-1 py-0 tabular-nums"
              >
                {{ chip.count }}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <TabsContent
            v-for="chip in chips"
            :key="chip.value"
            :value="chip.value"
            class="hidden"
          />
        </Tabs>
      </Scrollable>
    </template>

    <template #row="{ item, index }">
      <Item
        v-ripple
        role="checkbox"
        tabindex="0"
        :aria-checked="isSelected(libraryItemKey(item))"
        :data-item-key="libraryItemKey(item)"
        :data-item-index="index"
        class="h-16 w-full cursor-pointer gap-3 px-2 py-2 flex-nowrap"
        @click="handleRowClick(item, $event)"
        @keypress.enter="handleRowClick(item, $event)"
      >
        <ItemMedia>
          <EntityCoverImage
            :owner-type="item.type"
            :owner-id="item.id"
            :alt="item.title"
            :image-class="item.rounded ? 'size-10 rounded-full object-cover' : 'size-10 rounded-md object-cover'"
          />
        </ItemMedia>
        <ItemContent class="min-w-0">
          <ItemTitle
            class="w-full text-sm font-medium"
            :class="isSelected(libraryItemKey(item)) && 'text-primary'"
          >
            <span class="min-w-0 truncate">{{ item.title }}</span>
          </ItemTitle>
          <span class="block truncate text-xs text-muted-foreground">{{ rowSubtitle(item) }}</span>
        </ItemContent>
        <ItemActions>
          <Checkbox
            :model-value="isSelected(libraryItemKey(item))"
            size="lg"
            class="pointer-events-none"
          />
        </ItemActions>
      </Item>
    </template>

    <template #empty>
      <Empty class="p-4 py-8 md:p-4 md:py-8">
        <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
      </Empty>
    </template>
  </EntitySelectPanel>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { EntitySelectPanel } from "@/components/entity-select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Scrollable } from "@/components/ui/scrollable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSelection } from "@/composables/useSelection";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import { libraryItemKey, parseFolderEntryKey } from "@/modules/library/lib/folderEntryKey";
import {
  buildFolderPickerItems,
  countFolderPickerItemsByType,
  filterFolderPickerItems,
  normalizePickerQuery,
  type FolderPickerFilter,
  type FolderPickerItem,
} from "@/modules/library/lib/folderPicker";
import type { FolderLibraryItemType } from "@/modules/library/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelFolderAddPayload } from "@/modules/right-panel/types";

const props = defineProps<{
  payload: RightPanelFolderAddPayload;
}>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();
const { folders, movableItems, setFolderItems } = useLibrary();

// The panel is bound to a folder id, not to the sidebar's navigation: it
// resolves the folder itself, and a folder that vanishes (deleted while the
// panel is open) closes the panel.
const folder = computed(() => folders.value.find(f => f.id === props.payload.folderId) ?? null);
watch(folder, (next) => {
  if (!next) rightPanel.close();
});

const title = computed(() => (folder.value ? t("library.folder.addTo", { name: folder.value.name }) : ""));

const items = computed<FolderPickerItem[]>(() => folder.value
  ? buildFolderPickerItems(movableItems.value, folders.value, folder.value.id)
  : []);

const search = ref("");
const filter = ref<FolderPickerFilter>("all");

const visibleItems = computed(() => filterFolderPickerItems(items.value, filter.value, search.value));

// Chips mirror the sidebar filter tabs; a type with no candidates is not
// offered, and «all» is always first. If the active chip disappears (its last
// item got added), fall back to «all».
const counts = computed(() => countFolderPickerItemsByType(items.value));
const TYPE_ORDER: FolderLibraryItemType[] = ["artist", "album", "playlist"];
const typeLabels = computed<Record<FolderLibraryItemType, string>>(() => ({
  artist: t("library.filterArtists"),
  album: t("library.filterAlbums"),
  playlist: t("library.filterPlaylists"),
}));
const chips = computed(() => [
  { value: "all" as FolderPickerFilter, label: t("library.filterAll"), count: items.value.length },
  ...TYPE_ORDER
    .filter(type => counts.value[type] > 0)
    .map(type => ({ value: type as FolderPickerFilter, label: typeLabels.value[type], count: counts.value[type] })),
]);
watch(chips, (next) => {
  if (!next.some(chip => chip.value === filter.value)) filter.value = "all";
});

const rowSubtitle = (item: FolderPickerItem): string => {
  const typeLabel = t(`library.type.${item.type}`);
  if (item.folderName) return `${typeLabel} · ${t("library.folder.inFolder", { name: item.folderName })}`;
  return item.subtitle ? `${typeLabel} · ${item.subtitle}` : typeLabel;
};

const emptyLabel = computed(() => {
  const query = normalizePickerQuery(search.value);
  return query ? t("search.noResults.title", { query }) : t("library.folder.nothingToAdd");
});

// Selection is keyed by "<type>:<id>" so useSelection ranges/drag work over
// the visible (filtered) order, exactly like AddTracksPanel over tracks.
// `selectable` follows `visibleItems`, and useSelection's own watch prunes
// any selected id that drops out of it, so the FAB count and the confirmed
// entries are always exactly the checked rows currently on screen.
const selectable = computed(() => visibleItems.value.map(item => ({ id: libraryItemKey(item) })));
const {
  selectedIds,
  selectedCount,
  isSelected,
  handleSelect,
  clearSelection,
  attachDragListeners,
} = useSelection(selectable);

const handleRowClick = (item: FolderPickerItem, event: MouseEvent | KeyboardEvent) => {
  handleSelect({ id: libraryItemKey(item) }, event);
};

// The host keeps this instance across a same-tick folder switch
// (transition key = view:depth), so per-folder UI state must not leak.
watch(() => props.payload.folderId, () => {
  search.value = "";
  filter.value = "all";
  clearSelection();
});

const panelRef = useTemplateRef<{ listEl: HTMLElement | null }>("panelRef");
watch(
  () => panelRef.value?.listEl ?? null,
  (el, _prev, onCleanup) => {
    if (!el) return;
    const cleanup = attachDragListeners(el, {
      rowSelector: "[data-item-key]",
      idDataKey: "itemKey",
      indexDataKey: "itemIndex",
    });
    onCleanup(cleanup);
  },
  { flush: "post" },
);

// Appending is enough: the repository strips the entries from other folders.
const handleConfirm = async () => {
  const target = folder.value;
  if (!target) return;
  const entries = Array.from(selectedIds.value).flatMap(parseFolderEntryKey);
  if (entries.length === 0) return;

  try {
    await setFolderItems(target.id, [...target.items, ...entries]);
  }
  catch {
    toast.error(t("sheet.addFailed"));
    return;
  }
  clearSelection();
  if (rightPanel.view === "folder-add") rightPanel.close();
};
</script>
