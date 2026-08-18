import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";

/** Width (px) of the icon-only compact sidebar. */
export const SIDEBAR_COMPACT_WIDTH = 80;
/** Minimum width (px) of the expanded sidebar. */
export const SIDEBAR_EXPANDED_MIN_WIDTH = 280;
/** Maximum width (px) of the expanded sidebar. */
export const SIDEBAR_MAX_WIDTH = 400;
/**
 * While dragging, a width below this snaps to the compact layout; at or above
 * it the sidebar clamps back into the expanded [min, max] range.
 */
export const SIDEBAR_SNAP_THRESHOLD = 200;

interface SidebarState {
  isOpen: boolean;
  width: number;
}

const LEFT_SIDEBAR_KEY = "app-left-sidebar" as const;

const DEFAULT_LEFT_SIDEBAR: SidebarState = {
  isOpen: true,
  width: 280,
};

const leftSidebarState = useLocalStorage<SidebarState>(
  LEFT_SIDEBAR_KEY,
  DEFAULT_LEFT_SIDEBAR,
);

export function useSidebar() {
  const leftSidebar = computed(() => leftSidebarState.value);

  function toggleLeftSidebar() {
    leftSidebarState.value = {
      ...leftSidebarState.value,
      isOpen: !leftSidebarState.value.isOpen,
    };
  }

  function openLeftSidebar() {
    leftSidebarState.value = {
      ...leftSidebarState.value,
      isOpen: true,
    };
  }

  function closeLeftSidebar() {
    leftSidebarState.value = {
      ...leftSidebarState.value,
      isOpen: false,
    };
  }

  function expandLeftSidebar() {
    leftSidebarState.value = {
      isOpen: true,
      width: Math.max(leftSidebarState.value.width, SIDEBAR_EXPANDED_MIN_WIDTH),
    };
  }

  function setLeftSidebarWidth(width: number) {
    leftSidebarState.value = {
      ...leftSidebarState.value,
      width,
    };
  }

  return {
    leftSidebar,
    toggleLeftSidebar,
    openLeftSidebar,
    closeLeftSidebar,
    expandLeftSidebar,
    setLeftSidebarWidth,
  };
}
