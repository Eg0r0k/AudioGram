import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";

interface SidebarState {
  isOpen: boolean;
  width: number;
}

const DEFAULT_LEFT_SIDEBAR: SidebarState = {
  isOpen: true,
  width: 280,
};

const leftSidebarState = useLocalStorage<SidebarState>(
  "app-left-sidebar",
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
    setLeftSidebarWidth,
  };
}
