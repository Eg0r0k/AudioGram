import { computed } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { useTrackChapters } from "./useTrackChapters";
import type { TrackId } from "@/types/ids";

/**
 * Chapters of the track that is playing: the stored list and the one the
 * playhead is inside.
 *
 * Chapters exist for library tracks only; with an ephemeral (YouTube) track
 * the list stays empty.
 */
export const useCurrentTrackChapters = () => {
  const playerStore = usePlayerStore();
  const { libraryTrack } = useCurrentPlayerTrack();

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

  return { chapters, currentChapter };
};
