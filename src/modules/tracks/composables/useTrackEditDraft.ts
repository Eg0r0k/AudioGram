import { readonly, ref } from "vue";

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
 * Module-scoped so the edit form survives being unmounted while the right panel
 * shows an entity picker: the panel host renders one view at a time.
 */
const draft = ref<TrackEditDraft | null>(null);

export const useTrackEditDraft = () => {
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

  const clearDraft = (): void => {
    draft.value = null;
  };

  return {
    draft: readonly(draft),
    readDraft,
    setDraft,
    patchDraft,
    clearDraft,
  };
};
