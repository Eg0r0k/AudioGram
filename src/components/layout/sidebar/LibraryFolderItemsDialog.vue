<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="flex flex-col max-h-[80vh] sm:max-w-2xl gap-0 overflow-hidden h-full">
      <DialogHeader>
        <DialogTitle>{{ $t("library.folder.manageItems") }}</DialogTitle>
        <DialogDescription>
          {{ $t("library.folder.manageDescription") }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex items-center gap-1.5 px-4 py-2 shrink-0 overflow-x-auto">
        <span class="text-xs font-medium text-muted-foreground shrink-0 mr-0.5">{{ t("common.quickSelect") }}:</span>
        <Button
          size="sm"
          :variant="allArtistsSelected ? 'default' : 'secondary'"
          class="gap-1.5"
          @click="toggleAll('artist')"
        >
          <IconUsers class="size-3.5" />
          <span>{{ t("library.filterArtists") }}</span>
          <span class="tabular-nums opacity-70">({{ artistKeys.length }})</span>
        </Button>
        <Button
          size="sm"
          :variant="allAlbumsSelected ? 'default' : 'secondary'"
          class="gap-1.5"
          @click="toggleAll('album')"
        >
          <IconDisc class="size-3.5" />
          <span>{{ t("library.filterAlbums") }}</span>
          <span class="tabular-nums opacity-70">({{ albumKeys.length }})</span>
        </Button>
        <Button
          size="sm"
          :variant="allPlaylistsSelected ? 'default' : 'secondary'"
          class="gap-1.5"
          @click="toggleAll('playlist')"
        >
          <IconPlaylist class="size-3.5" />
          <span>{{ t("library.filterPlaylists") }}</span>
          <span class="tabular-nums opacity-70">({{ playlistKeys.length }})</span>
        </Button>
      </div>

      <div
        ref="listRef"
        class="flex-1 min-h-0 overflow-y-auto"
      >
        <div
          v-for="(item, index) in items"
          :key="libraryItemKey(item)"
          role="button"
          tabindex="0"
          :data-item-key="libraryItemKey(item)"
          :data-item-index="index"
          class="flex h-16 w-full select-none items-center gap-3 rounded-none px-4 transition-colors hover:bg-accent/60 cursor-pointer"
          @click="handleRowClick(item, $event)"
          @keypress.enter="handleRowClick(item, $event)"
        >
          <button
            class="flex h-full w-8 shrink-0 items-center justify-center"
            @click.stop="handleRowClick(item, $event)"
          >
            <Checkbox
              :model-value="isSelected(libraryItemKey(item))"
              size="lg"
              class="pointer-events-none"
            />
          </button>
          <div class="relative size-10 shrink-0 overflow-hidden rounded bg-muted">
            <EntityCoverImage
              :owner-type="item.type as CoverOwnerType"
              :owner-id="item.id"
              :alt="item.title"
              class="size-full object-cover"
            />
          </div>
          <span class="min-w-0 flex-1">
            <span
              class="block truncate text-sm font-medium"
              :class="isSelected(libraryItemKey(item)) && 'text-primary'"
            >{{ item.title }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ folderItemLabel(item) }}</span>
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="ghost"
          @click="isOpen = false"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button @click="emit('save', selectedEntries)">
          {{ $t("common.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, type ComputedRef, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import IconUsers from "~icons/tabler/users";
import IconDisc from "~icons/tabler/disc";
import IconPlaylist from "~icons/tabler/playlist";
import type { CoverOwnerType } from "@/db/entities";
import type { FolderLibraryItemType, LibraryFolderEntry, LibraryItem } from "@/modules/library/types";
import { useSelection } from "@/composables/useSelection";

type MovableLibraryItem = LibraryItem & { type: FolderLibraryItemType };

const props = defineProps<{
  open: boolean;
  items: MovableLibraryItem[];
  selectedKeys: string[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "update:selectedKeys": [selectedKeys: string[]];
  "save": [items: LibraryFolderEntry[]];
}>();

const { t } = useI18n();

function libraryItemKey(item: Pick<LibraryItem, "type" | "id">): string {
  return `${item.type}:${item.id}`;
}

function parseFolderEntryKey(key: string): LibraryFolderEntry[] {
  const [type, id] = key.split(":");
  if (!isFolderLibraryItemType(type) || !id) return [];
  return [{ type, id }];
}

function isFolderLibraryItemType(type: string): type is FolderLibraryItemType {
  return type === "artist" || type === "album" || type === "playlist";
}

function folderItemLabel(item: MovableLibraryItem): string {
  const typeLabel = t(`library.type.${item.type}`);
  return item.subtitle ? `${typeLabel} · ${item.subtitle}` : typeLabel;
}

const selectableItems = computed(() =>
  props.items.map(item => ({ id: libraryItemKey(item) })),
);

const {
  selectedIds,
  isSelected,
  toggleById,
  clearSelection,
  handleSelect,
  attachDragListeners,
} = useSelection(selectableItems);

const listRef = useTemplateRef<HTMLElement>("listRef");

watch(
  listRef,
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

watch(selectableItems, (items) => {
  clearSelection();
  const validKeys = new Set(items.map(i => i.id));
  for (const key of props.selectedKeys) {
    if (validKeys.has(key)) {
      toggleById(key, true);
    }
  }
}, { immediate: true });

watch(selectedIds, (ids) => {
  emit("update:selectedKeys", Array.from(ids));
}, { deep: true });

const artistKeys = computed(() => props.items
  .filter(item => item.type === "artist")
  .map(libraryItemKey),
);

const albumKeys = computed(() => props.items
  .filter(item => item.type === "album")
  .map(libraryItemKey),
);

const playlistKeys = computed(() => props.items
  .filter(item => item.type === "playlist")
  .map(libraryItemKey),
);

const allArtistsSelected = computed(() =>
  artistKeys.value.length > 0 && artistKeys.value.every(key => selectedIds.value.has(key)),
);

const allAlbumsSelected = computed(() =>
  albumKeys.value.length > 0 && albumKeys.value.every(key => selectedIds.value.has(key)),
);

const allPlaylistsSelected = computed(() =>
  playlistKeys.value.length > 0 && playlistKeys.value.every(key => selectedIds.value.has(key)),
);

function toggleAll(type: FolderLibraryItemType) {
  const keysByType: Record<FolderLibraryItemType, ComputedRef<string[]>> = {
    artist: artistKeys,
    album: albumKeys,
    playlist: playlistKeys,
  };
  const keys = keysByType[type].value;
  const allSelected = keys.every(key => selectedIds.value.has(key));
  for (const key of keys) {
    toggleById(key, !allSelected);
  }
}

function handleRowClick(item: MovableLibraryItem, event: MouseEvent | KeyboardEvent): void {
  handleSelect({ id: libraryItemKey(item) }, event);
}

const isOpen = computed({
  get: () => props.open,
  set: value => emit("update:open", value),
});

const selectedEntries = computed(() =>
  Array.from(selectedIds.value).flatMap(parseFolderEntryKey),
);
</script>
