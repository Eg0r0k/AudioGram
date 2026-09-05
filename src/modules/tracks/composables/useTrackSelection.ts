import { watch } from "vue";
import type { ComputedRef, Ref } from "vue";
import type { Track } from "@/modules/player/types";
import { useSelection, type UseSelectionOptions } from "@/composables/useSelection";

export function useTrackSelection(
  tracks: Ref<Track[]> | ComputedRef<Track[]>,
  containerRef: Ref<HTMLElement | null>,
  options: UseSelectionOptions = {},
) {
  const selection = useSelection(tracks, options);

  watch(
    containerRef,
    (el, _prev, onCleanup) => {
      if (!el) return;

      const cleanup = selection.attachDragListeners(el, {
        rowSelector: "[data-track-id]",
        idDataKey: "trackId",
        indexDataKey: "trackIndex",
      });

      onCleanup(cleanup);
    },
    { flush: "post" },
  );

  return {
    ...selection,
    handleTrackSelect: selection.handleSelect,
  };
}
