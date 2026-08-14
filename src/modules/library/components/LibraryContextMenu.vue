<template>
  <ContextMenu v-model:open="isContextMenuOpen">
    <ContextMenuCloseBridge :open="isContextMenuOpen" />
    <!-- Capture phase, declared in the template so it is guaranteed to bind:
         the reka trigger below opens the shell on right-click no matter what
         our row handlers do, so an event that cannot fill the menu has to be
         stopped before it ever reaches the trigger. -->
    <div
      class="contents"
      @contextmenu.capture="guardContextMenu"
    >
      <ContextMenuTrigger as-child>
        <slot />
      </ContextMenuTrigger>
    </div>

    <ContextMenuContent
      class="w-50 bg-popover/50 backdrop-blur-[50px]"
    >
      <template v-if="activeItem">
        <component
          :is="contextComponent"
          v-bind="contextProps"
        />
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import {
  ContextMenu,
  ContextMenuCloseBridge,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useMenuCursorAutoClose } from "@/composables/useMenuCursorAutoClose";
import { useLibraryMenu } from "@/modules/library/composables/useLibraryMenu";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import type { LibraryItem } from "@/modules/library/types";
import ArtistContext from "./contexts/ArtistContext.vue";
import CatalogContext from "./contexts/CatalogContext.vue";
import DefaultContext from "./contexts/DefaultContext.vue";
import FavoriteContext from "./contexts/FavoriteContext.vue";
import FolderContext from "./contexts/FolderContext.vue";
import { useLibraryContextActions } from "../composables/useLibraryContextActions";

const props = withDefaults(defineProps<{
  insideFolder?: boolean;
}>(), {
  insideFolder: false,
});

const { activeItem, menuFlavor, isContextMenuOpen } = useLibraryMenu();

useMenuCursorAutoClose(isContextMenuOpen, () => {
  isContextMenuOpen.value = false;
}, { contentSelector: "[data-slot=\"context-menu-content\"]" });
const { togglePin, createPlaylist } = useLibrary();
const { addToQueue, addCatalogToQueue, downloadCatalog } = useLibraryContextActions();

const contexts: Record<LibraryItem["type"], Component> = {
  artist: ArtistContext,
  album: DefaultContext,
  playlist: DefaultContext,
  liked: FavoriteContext,
  allMedia: FavoriteContext,
  folder: FolderContext,
};

const contextComponent = computed(() => {
  if (!activeItem.value) return null;
  // Catalog rows share one context: only source actions apply to them.
  if (menuFlavor.value === "catalog") return CatalogContext;
  return contexts[activeItem.value.type];
});

const contextProps = computed(() => {
  if (!activeItem.value) {
    return {};
  }

  if (menuFlavor.value === "catalog") {
    return {
      item: activeItem.value,
      addToQueue: handleCatalogAddToQueue,
      download: handleCatalogDownload,
    };
  }

  switch (activeItem.value.type) {
    case "artist":
      return {
        item: activeItem.value,
        onTogglePin: handleTogglePin,
        onMoveToFolder: handleMoveToFolder,
        onRemoveFromFolder: props.insideFolder ? handleRemoveFromFolder : undefined,
        onDelete: handleDelete,
      };
    case "folder":
      return {
        openFolder: handleOpenFolder,
        manageFolder: handleManageFolder,
        renameFolder: handleRenameFolder,
        deleteFolder: handleDelete,
      };
    case "liked":
    case "allMedia":
      return {
        item: activeItem.value,
        addToQueue: handleAddToQueue,
        createPlaylist: handleCreatePlaylist,
      };
    default:
      return {
        item: activeItem.value,
        togglePin: handleTogglePin,
        addToQueue: handleAddToQueue,
        createPlaylist: handleCreatePlaylist,
        moveToFolder: handleMoveToFolder,
        removeFromFolder: props.insideFolder ? handleRemoveFromFolder : undefined,
        deleteItem: handleDelete,
      };
  }
});

function guardContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const row = target.closest("[data-library-item]");
  // Off-row, or a row with nothing to show (a catalog artist).
  if (!row || row.matches("[data-library-menu=\"none\"]")) {
    event.preventDefault();
    event.stopPropagation();
  }
}

const handleTogglePin = () => {
  if (!activeItem.value || activeItem.value.type === "liked" || activeItem.value.type === "allMedia" || activeItem.value.type === "folder") return;
  togglePin(activeItem.value.type, activeItem.value.id);
};

const handleAddToQueue = async () => {
  if (!activeItem.value || activeItem.value.type === "artist") return;
  await addToQueue(activeItem.value);
};

const handleCreatePlaylist = async () => {
  await createPlaylist();
};

const handleCatalogAddToQueue = async () => {
  if (!activeItem.value) return;
  await addCatalogToQueue(activeItem.value);
};

const handleCatalogDownload = async () => {
  if (!activeItem.value) return;
  await downloadCatalog(activeItem.value);
};

const emit = defineEmits<{
  delete: [item: LibraryItem];
  openFolder: [folderId: string];
  manageFolder: [folderId: string];
  renameFolder: [folderId: string];
  moveToFolder: [item: LibraryItem];
  removeFromFolder: [item: LibraryItem];
}>();

const handleDelete = () => {
  if (!activeItem.value || activeItem.value.type === "liked" || activeItem.value.type === "allMedia") return;
  emit("delete", activeItem.value);
};

const handleOpenFolder = () => {
  if (!activeItem.value || activeItem.value.type !== "folder") return;
  emit("openFolder", activeItem.value.id);
};

const handleManageFolder = () => {
  if (!activeItem.value || activeItem.value.type !== "folder") return;
  emit("manageFolder", activeItem.value.id);
};

const handleRenameFolder = () => {
  if (!activeItem.value || activeItem.value.type !== "folder") return;
  emit("renameFolder", activeItem.value.id);
};

const handleMoveToFolder = () => {
  if (!activeItem.value || activeItem.value.type === "liked" || activeItem.value.type === "allMedia" || activeItem.value.type === "folder") return;
  emit("moveToFolder", activeItem.value);
};

const handleRemoveFromFolder = () => {
  if (!activeItem.value || activeItem.value.type === "liked" || activeItem.value.type === "allMedia" || activeItem.value.type === "folder") return;
  emit("removeFromFolder", activeItem.value);
};
</script>
