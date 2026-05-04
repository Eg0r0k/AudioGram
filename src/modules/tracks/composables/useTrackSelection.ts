import type { ComputedRef, Ref } from "vue";
import { watchEffect } from "vue";
import type { Track } from "@/modules/player/types";
import { useSelection } from "@/composables/useSelection";

export function useTrackSelection(
  tracks: Ref<Track[]> | ComputedRef<Track[]>,
  containerRef: Ref<HTMLElement | null>,
) {
  const selection = useSelection(tracks);

  watchEffect((onCleanup) => {
    const el = containerRef.value;
    if (!el) return;

    const cleanup = selection.attachDragListeners(el, {
      rowSelector: "[data-track-id]",
      idDataKey: "trackId",
      indexDataKey: "trackIndex",
    });

    onCleanup(cleanup);
  });

  return {
    ...selection,
    handleTrackSelect: selection.handleSelect,
  };
}
