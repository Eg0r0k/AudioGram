import type { PlayerTrack } from "@/modules/player/types";
import type { TrackContext } from "@/modules/tracks/components/menu/type";
import type { QueueItemId } from "@/types/ids";
import { ref, watch } from "vue";

// PlayerTrack, not Track: the current-track and queue contexts also open the
// menu for ephemeral tracks (YouTube streams, radio).
const activeTrack = ref<PlayerTrack | null>(null);
const activeIndex = ref<number | null>(null);
const activeQueueItemId = ref<QueueItemId | null>(null);

const isDropdownOpen = ref(false);
const isContextMenuOpen = ref(false);
const activeDropdownTarget = ref<TrackContext>("default");
const activeContextMenuTarget = ref<TrackContext>("default");

const dropdownAnchor = ref({ x: 0, y: 0, width: 0, height: 0 });

let lastCloseTime = 0;
let lastClosedTrackId: string | null = null;

// Active state intentionally survives close: menu content must stay rendered
// during the close animation, and every open overwrites it anyway.
watch(isDropdownOpen, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen) {
    lastCloseTime = Date.now();
    lastClosedTrackId = activeTrack.value?.id ?? null;
  }
});

interface OpenTrackMenuOptions {
  queueItemId?: QueueItemId | null;
  target?: TrackContext;
}

export function useTrackMenu() {
  const openMenu = (
    track: PlayerTrack,
    index: number,
    options?: OpenTrackMenuOptions,
  ) => {
    activeTrack.value = track;
    activeIndex.value = index;
    activeQueueItemId.value = options?.queueItemId ?? null;
    activeContextMenuTarget.value = options?.target ?? "default";
    isDropdownOpen.value = false;
    isContextMenuOpen.value = true;
  };

  const closeMenu = () => {
    isContextMenuOpen.value = false;
  };

  const openDropdown = (
    track: PlayerTrack,
    index: number,
    event: MouseEvent,
    options?: OpenTrackMenuOptions,
  ) => {
    const timeSinceClose = Date.now() - lastCloseTime;
    if (timeSinceClose < 150 && lastClosedTrackId === track.id) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    activeTrack.value = track;
    activeIndex.value = index;
    activeQueueItemId.value = options?.queueItemId ?? null;
    activeDropdownTarget.value = options?.target ?? "default";

    dropdownAnchor.value = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };

    isContextMenuOpen.value = false;
    isDropdownOpen.value = true;
  };

  const closeDropdown = () => {
    isDropdownOpen.value = false;
  };

  return {
    activeTrack,
    activeIndex,
    activeQueueItemId,
    isDropdownOpen,
    isContextMenuOpen,
    activeDropdownTarget,
    activeContextMenuTarget,
    dropdownAnchor,
    openMenu,
    closeMenu,
    openDropdown,
    closeDropdown,
  };
}
