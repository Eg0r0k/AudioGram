import { computed } from "vue";
import { usePlayerStore } from "../store/player.store";
import { isLibraryTrack, type PlayerTrack, type Track } from "../types";

/**
 * The track the player is showing, split by what it is allowed to offer.
 *
 * Any playing track — library or ephemeral (YouTube) — drives the display;
 * library-only affordances (like, chapters, lyrics) gate on `libraryTrack`.
 * Same split as SidebarMusic in the desktop footer.
 */
export const useCurrentPlayerTrack = () => {
  const playerStore = usePlayerStore();

  const currentTrack = computed<PlayerTrack | null>(() => playerStore.currentTrack);
  const libraryTrack = computed<Track | null>(() =>
    isLibraryTrack(currentTrack.value) ? currentTrack.value : null,
  );

  return { currentTrack, libraryTrack };
};
