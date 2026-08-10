import { computed, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { skipToken, useQuery } from "@tanstack/vue-query";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { isLibraryTrack } from "@/modules/player/types";
import { queryKeys } from "@/queries/query-keys";
import type { PlaylistEntity } from "@/db/entities";
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

  const { data: playlistDetail } = useQuery(computed(() => ({
    queryKey: queryKeys.playlists.detail(toValue(options.playlistId) ?? NO_PLAYLIST_ID),
    queryFn: skipToken,
  })));

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
        const trackIds = (playlistDetail.value as PlaylistEntity | undefined)?.trackIds;
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
