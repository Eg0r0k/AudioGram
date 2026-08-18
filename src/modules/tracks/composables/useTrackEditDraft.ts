import { effectScope, readonly, ref, watch } from "vue";
import type { EffectScope } from "vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelView } from "@/modules/right-panel/types";

export interface TrackEditDraft {
  trackId: string;
  title: string;
  artists: string[];
  albumId: string | null;
  albumLabel: string;
  newAlbumTitle: string | null;
  trackNo: number | null;
  diskNo: number | null;
}

/**
 * Views that own the draft: the edit form itself and the entity pickers it
 * hands off to. Leaving that pair — or closing the panel — abandons the draft.
 */
const DRAFT_VIEWS: RightPanelView[] = ["edit-track", "entity-select"];

/**
 * Module-scoped so the edit form survives being unmounted while the right panel
 * shows an entity picker: the panel host renders one view at a time.
 */
const draft = ref<TrackEditDraft | null>(null);

const clearDraft = (): void => {
  draft.value = null;
};

let lifecycleScope: EffectScope | null = null;
let watchedStore: ReturnType<typeof useRightPanelStore> | null = null;

/**
 * A draft outlives the component that owns it, so nothing component-scoped can
 * drop it when the panel closes from a picker (or from the mobile close path).
 * The watcher therefore lives in a detached scope next to the draft itself and
 * is re-bound whenever the active pinia instance changes (tests).
 */
const ensureDraftLifecycle = (): void => {
  const rightPanel = useRightPanelStore();
  if (watchedStore === rightPanel) return;

  lifecycleScope?.stop();
  watchedStore = rightPanel;
  lifecycleScope = effectScope(true);

  lifecycleScope.run(() => {
    watch(
      () => [rightPanel.isOpen, rightPanel.view] as const,
      ([isOpen, view]) => {
        if (!draft.value) return;
        if (isOpen && DRAFT_VIEWS.includes(view)) return;

        clearDraft();
      },
    );
  });
};

export const useTrackEditDraft = () => {
  ensureDraftLifecycle();

  const readDraft = (trackId: string): TrackEditDraft | null => {
    return draft.value?.trackId === trackId ? draft.value : null;
  };

  const setDraft = (next: TrackEditDraft): void => {
    draft.value = next;
  };

  const patchDraft = (trackId: string, patch: Partial<Omit<TrackEditDraft, "trackId">>): void => {
    if (draft.value?.trackId !== trackId) return;
    draft.value = { ...draft.value, ...patch };
  };

  return {
    draft: readonly(draft),
    readDraft,
    setDraft,
    patchDraft,
    clearDraft,
  };
};
