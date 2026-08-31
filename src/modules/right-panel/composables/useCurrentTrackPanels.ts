import { computed, type ComputedRef } from "vue";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useRightPanelStore } from "../store/right-panel.store";
import type { RightPanelView } from "../types";

/**
 * The right-panel views that belong to whatever is playing — chapters,
 * lyrics, queue — as toggles: tapping the view that is already open closes
 * the panel instead of reopening it.
 *
 * Chapters are a library-only view, so opening them is a no-op while an
 * ephemeral (YouTube) track plays.
 */
export const useCurrentTrackPanels = () => {
  const rightPanelStore = useRightPanelStore();
  const { libraryTrack } = useCurrentPlayerTrack();

  const isViewOpen = (view: RightPanelView) =>
    computed(() => rightPanelStore.isOpen && rightPanelStore.view === view);

  const asToggle = (isOpen: ComputedRef<boolean>, open: () => void) => () => {
    if (isOpen.value) {
      rightPanelStore.close();
      return;
    }
    open();
  };

  const openChapters = () => {
    const track = libraryTrack.value;
    if (!track) return;
    rightPanelStore.openChapters({ track });
  };
  const openLyrics = () => rightPanelStore.openLyrics();
  const openQueue = () => rightPanelStore.openQueue();

  const isChaptersOpen = isViewOpen("chapters");
  const isLyricsOpen = isViewOpen("lyrics");
  const isQueueOpen = isViewOpen("queue");

  return {
    isChaptersOpen,
    openChapters,
    toggleChapters: asToggle(isChaptersOpen, openChapters),
    isLyricsOpen,
    toggleLyrics: asToggle(isLyricsOpen, openLyrics),
    isQueueOpen,
    toggleQueue: asToggle(isQueueOpen, openQueue),
  };
};
