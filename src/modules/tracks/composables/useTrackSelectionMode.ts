import { computed, ref, watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import { onKeyStroke } from "@vueuse/core";
import type { Track } from "@/modules/player/types";
import type { TrackId } from "@/types/ids";
import { useTrackSelection } from "./useTrackSelection";

export interface UseTrackSelectionModeOptions {
  /** Every id for the current sort + search — the whole library, not the loaded pages. */
  getAllIds: () => Promise<TrackId[]>;
  /** Total row count for the current sort + search (infinite query's `total`). */
  total: Ref<number> | ComputedRef<number>;
  /** Any change exits the mode (sort / search changed). */
  resetKey: Ref<unknown> | ComputedRef<unknown>;
}

export const useTrackSelectionMode = (
  tracks: Ref<Track[]> | ComputedRef<Track[]>,
  containerRef: Ref<HTMLElement | null>,
  options: UseTrackSelectionModeOptions,
) => {
  // Pruning is off: "select all" holds ids the infinite query has not loaded.
  const selection = useTrackSelection(tracks, containerRef, { pruneToItems: false });

  const isSelectMode = ref(false);
  const isSelectingAll = ref(false);

  const isAllSelected = computed(() => {
    const total = options.total.value;
    return total > 0 && selection.selectedCount.value >= total;
  });

  const enter = (trackId?: TrackId) => {
    isSelectMode.value = true;
    if (trackId) selection.toggleById(trackId, true);
  };

  const exit = () => {
    isSelectMode.value = false;
    isSelectingAll.value = false;
    selection.clearSelection();
  };

  const selectAll = async () => {
    if (isSelectingAll.value) return;
    isSelectingAll.value = true;
    try {
      const ids = await options.getAllIds();
      if (!isSelectMode.value) return;
      selection.setSelectedIds(ids);
    }
    finally {
      isSelectingAll.value = false;
    }
  };

  const deselectAll = () => selection.clearSelection();

  const handleTrackSelect = (track: Track, event: MouseEvent | KeyboardEvent) => {
    isSelectMode.value = true;
    selection.handleTrackSelect(track, event);
  };

  // Drag / long-press write into the selection without going through
  // handleTrackSelect, so the mode follows the count as well.
  watch(selection.selectedCount, (count) => {
    if (count > 0) isSelectMode.value = true;
  });

  watch(options.resetKey, () => {
    if (isSelectMode.value) exit();
  });

  onKeyStroke("Escape", (event) => {
    if (!isSelectMode.value) return;
    // reka overlays (dropdown menus, dialogs) share this window Escape listener and
    // don't preventDefault, so let an open overlay close first before exiting the mode.
    if (document.querySelector("[data-dismissable-layer]")) return;
    event.preventDefault();
    exit();
  });

  return {
    ...selection,
    handleTrackSelect,
    isSelectMode,
    isSelectingAll,
    isAllSelected,
    enter,
    exit,
    selectAll,
    deselectAll,
  };
};
