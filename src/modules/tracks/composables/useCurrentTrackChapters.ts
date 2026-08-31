import { computed } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useCurrentTrackPanels } from "@/modules/right-panel/composables/useCurrentTrackPanels";
import { useSaveTrackChapters, useTrackChapters } from "./useTrackChapters";
import type { TrackId } from "@/types/ids";

/**
 * Chapters of the track that is playing: the stored list, the one the
 * playhead is inside, and adding a new mark from a position on the seek bar.
 *
 * Chapters exist for library tracks only; with an ephemeral (YouTube) track
 * the list stays empty and adding a mark is a no-op.
 */
export const useCurrentTrackChapters = () => {
  const playerStore = usePlayerStore();
  const { libraryTrack } = useCurrentPlayerTrack();
  const { openChapters } = useCurrentTrackPanels();
  const saveChapters = useSaveTrackChapters();

  const trackId = computed<TrackId>(() => libraryTrack.value?.id ?? ("" as TrackId));

  const { data: chapters } = useTrackChapters(trackId);

  // The chapter whose start the playhead has passed; the sorted list makes the
  // last matching entry the active one.
  const currentChapter = computed(() => {
    const list = chapters.value ?? [];
    if (list.length === 0) return null;

    let active = list[0];
    for (const chapter of list) {
      if (chapter.time > playerStore.currentTime) break;
      active = chapter;
    }
    return active;
  });

  /** Adds a mark at `percent` of the track, then reveals it in the panel. */
  const addMarkAt = async (percent: number) => {
    const track = libraryTrack.value;
    if (!track) return;

    const time = (percent / 100) * (playerStore.duration ?? 0);
    const existing = chapters.value ?? [];
    const updated = [...existing, { time, title: "" }].sort((a, b) => a.time - b.time);
    await saveChapters.mutateAsync({ trackId: track.id, chapters: updated });

    openChapters();
  };

  return { chapters, currentChapter, addMarkAt };
};
