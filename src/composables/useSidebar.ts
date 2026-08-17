import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { SIDEBAR_EXPANDED_MIN_WIDTH } from "@/components/layout/sidebar/sidebarCompact";

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
