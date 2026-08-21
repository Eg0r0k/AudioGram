import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { isLibraryTrack } from "@/modules/player/types";
import { playlistQueries } from "@/queries/playlist.queries";
import { PlaylistId } from "@/types/ids";
import type { TrackContext } from "../type";

const NO_PLAYLIST_ID = PlaylistId("__track-menu-auto-close-none__");

export function useTrackMenuAutoClose(
  isOpen: Ref<boolean>,
  options: {
    context: MaybeRefOrGetter<TrackContext>;
    playlistId?: MaybeRefOrGetter<PlaylistId | undefined>;
  },
) {
  const { activeTrack, activeQueueItemId, closeMenu, closeDropdown } = useTrackMenu();
  const queueStore = useQueueStore();

  // A real (cheap, Dexie-backed) queryFn, NOT skipToken: playlist mutations
  // invalidate ["playlists", id], and when this observer is the only one on
  // that key a skipToken entry cannot be refetched — tanstack retries into
  // "Attempted to invoke queryFn when set to skipToken" spam. The enabled
  // gate keeps the no-playlist case a genuinely disabled query, which
  // invalidation skips.
  const playlistId = computed(() => toValue(options.playlistId));
  const { data: playlistDetail } = useQuery(computed(() => playlistQueries.detail(
    playlistId.value ?? NO_PLAYLIST_ID,
    playlistId.value !== undefined,
  )));

  const isEntityGone = computed(() => {
    if (!isOpen.value) return false;
    const track = activeTrack.value;
    if (!track) return false;

    switch (toValue(options.context)) {
      case "queue": {
        const itemId = activeQueueItemId.value;
        if (!itemId) return false;
        return !queueStore.upcomingItems.some(item => item.id === itemId);
      }
      case "playlist": {
        if (!isLibraryTrack(track)) return false;
        const trackIds = playlistDetail.value?.trackIds;
        if (!trackIds) return false;
        return !trackIds.includes(track.id);
      }
      default:
        return false;
    }
  });

  watch(isEntityGone, (gone) => {
    if (!gone) return;
    closeMenu();
    closeDropdown();
  });
}
