import { ref, watch } from "vue";
import type { LibraryItem } from "@/modules/library/types";
import { albumRepository, artistRepository, playlistRepository } from "@/db/repositories";
import { getLogger } from "@/lib/logger";
import { sourceKindOf } from "@/modules/sources/lib/display";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

/**
 * Which action set the open menu serves: a Dexie-backed library row, or a
 * live catalog row (ND browsing) that only supports source actions.
 */
export type LibraryMenuFlavor = "library" | "catalog";

const activeItem = ref<LibraryItem | null>(null);
const menuFlavor = ref<LibraryMenuFlavor>("library");
const isContextMenuOpen = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingReset() {
  if (!resetTimer) return;
  clearTimeout(resetTimer);
  resetTimer = null;
}

function scheduleReset() {
  cancelPendingReset();
  resetTimer = setTimeout(() => {
    if (isContextMenuOpen.value) return;
    activeItem.value = null;
  }, 120);
}

watch(isContextMenuOpen, (isOpen) => {
  if (!isOpen) {
    scheduleReset();
  }
});

/** Whether the item is backed by a real library row (shadow rows included). */
async function hasLibraryRow(item: LibraryItem): Promise<boolean> {
  switch (item.type) {
    case "album": {
      const found = await albumRepository.findById(item.id as AlbumId);
      return found.isOk() && !!found.value;
    }
    case "artist": {
      const found = await artistRepository.findById(item.id as ArtistId);
      return found.isOk() && !!found.value;
    }
    case "playlist": {
      const found = await playlistRepository.findById(item.id as PlaylistId);
      return found.isOk() && !!found.value;
    }
    default:
      return true;
  }
}

/** Catalog rows with something actionable — the rest never open a menu. */
function hasCatalogMenu(item: LibraryItem): boolean {
  return item.type === "album" || item.type === "playlist";
}

/**
 * Whether right-clicking the row may open a menu at all. Rows must mark
 * themselves in the DOM with this: the reka trigger sits on an ancestor and
 * opens the shell AFTER the row's own handler runs, so closing the menu from
 * `openMenu` is too late — the event has to be stopped before it gets there
 * (see the capture-phase guard in LibraryContextMenu).
 */
export function canOpenLibraryMenu(item: LibraryItem): boolean {
  if (!item.isCatalog) return true;
  return hasCatalogMenu(item);
}

export function useLibraryMenu() {
  const show = (item: LibraryItem, flavor: LibraryMenuFlavor) => {
    cancelPendingReset();
    activeItem.value = item;
    menuFlavor.value = flavor;
    isContextMenuOpen.value = true;
  };

  /** The shell opens itself on right-click; with no items it must close. */
  const closeEmpty = () => {
    isContextMenuOpen.value = false;
  };

  const openMenu = (item: LibraryItem) => {
    if (item.isCatalog) {
      // Live catalog row: no DB lookup to make, only source actions apply.
      if (hasCatalogMenu(item)) show(item, "catalog");
      else closeEmpty();
      return;
    }

    if (sourceKindOf(item.id) === "local") {
      show(item, "library");
      return;
    }

    // Remote-prefixed id outside catalog browsing = a downloaded/pinned
    // SHADOW row: a library entity with the full action set (M5).
    hasLibraryRow(item).then(
      (exists) => {
        if (exists) show(item, "library");
        else closeEmpty();
      },
      (error: unknown) => {
        // The menu closes — say why, otherwise a broken read looks exactly
        // like "this row is a catalog row".
        getLogger().error(`[Library] Menu lookup failed for ${item.type} ${item.id}: ${String(error)}`);
        closeEmpty();
      },
    );
  };

  const closeMenu = () => {
    isContextMenuOpen.value = false;
  };

  return {
    activeItem,
    menuFlavor,
    isContextMenuOpen,
    openMenu,
    closeMenu,
  };
}
