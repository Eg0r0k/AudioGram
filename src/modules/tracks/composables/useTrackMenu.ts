import type { PlayerTrack } from "@/modules/player/types";
import {
  isTrackMenuSubject,
  toTrackMenuSubject,
  trackMenuSubjectId,
  type TrackContext,
  type TrackMenuSubject,
} from "@/modules/tracks/components/menu/type";
import type { QueueItemId } from "@/types/ids";
import { ref, watch } from "vue";

// The menu subject: a library track, a not-yet-pinned remote DTO, or an
// ephemeral track. PlayerTrack call sites keep working through the adapter
// overload on openMenu/openDropdown.
const activeSubject = ref<TrackMenuSubject | null>(null);

// Legacy view of the subject for shells that still consume PlayerTrack.
// Remote subjects have no PlayerTrack shape, so this stays null for them.
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
    lastClosedTrackId = trackMenuSubjectId(activeSubject.value);
  }
});

interface OpenTrackMenuOptions {
  queueItemId?: QueueItemId | null;
  target?: TrackContext;
}

function setActiveSubject(input: PlayerTrack | TrackMenuSubject) {
  const subject = isTrackMenuSubject(input) ? input : toTrackMenuSubject(input);
  activeSubject.value = subject;
  activeTrack.value = subject.kind === "remote" ? null : subject.track;
}

export function useTrackMenu() {
  const openMenu = (
    track: PlayerTrack | TrackMenuSubject,
    index: number,
    options?: OpenTrackMenuOptions,
  ) => {
    setActiveSubject(track);
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
    track: PlayerTrack | TrackMenuSubject,
    index: number,
    event: MouseEvent,
    options?: OpenTrackMenuOptions,
  ) => {
    const inputId = isTrackMenuSubject(track) ? trackMenuSubjectId(track) : track.id;
    const timeSinceClose = Date.now() - lastCloseTime;
    if (timeSinceClose < 150 && lastClosedTrackId === inputId) {
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    setActiveSubject(track);
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
    activeSubject,
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
