import { ref, watch } from "vue";
import type { LibraryItem } from "@/modules/library/types";
import { albumRepository, artistRepository, playlistRepository } from "@/db/repositories";
import { getLogger } from "@/lib/logger";
import { sourceKindOf } from "@/modules/sources/lib/display";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

const activeItem = ref<LibraryItem | null>(null);
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

export function useLibraryMenu() {
  const show = (item: LibraryItem) => {
    cancelPendingReset();
    activeItem.value = item;
    isContextMenuOpen.value = true;
  };

  const openMenu = (item: LibraryItem) => {
    if (sourceKindOf(item.id) === "local") {
      show(item);
      return;
    }
    // Remote-prefixed ids split in two: downloaded/pinned SHADOW rows are
    // library entities with the full action set (M5); live CATALOG rows
    // from ND/YT browsing have no DB row — the menu stays closed for them.
    hasLibraryRow(item).then(
      (exists) => {
        if (exists) show(item);
      },
      (error: unknown) => {
        // The menu stays closed — say why, otherwise a broken read looks
        // exactly like "this row is a catalog row".
        getLogger().error(`[Library] Menu lookup failed for ${item.type} ${item.id}: ${String(error)}`);
      },
    );
  };

  const closeMenu = () => {
    isContextMenuOpen.value = false;
  };

  return {
    activeItem,
    isContextMenuOpen,
    openMenu,
    closeMenu,
  };
}
