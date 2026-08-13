import { ref, watch } from "vue";
import type { LibraryItem } from "@/modules/library/types";
import { sourceKindOf } from "@/modules/sources/lib/display";

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

export function useLibraryMenu() {
  const openMenu = (item: LibraryItem) => {
    // Sidebar menus act on library entities (delete, folders, pin) — remote
    // catalog items from ND browsing have none of that until M4+.
    if (sourceKindOf(item.id) !== "local") return;

    cancelPendingReset();
    activeItem.value = item;
    isContextMenuOpen.value = true;
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
