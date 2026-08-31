import { computed } from "vue";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
import { useCurrentPlayerTrack } from "@/modules/player/composables/useCurrentPlayerTrack";
import { isEphemeralTrack } from "@/modules/player/types";

export const FALLBACK_COVER_URL = "/img/fallback.svg";

/**
 * Cover art of whatever is playing. Library tracks resolve through the cover
 * store (album- or track-owned blob); ephemeral tracks (YouTube, radio, open
 * with) carry a direct URL. Always yields a renderable src.
 */
export const useCurrentTrackCover = () => {
  const { currentTrack: track, libraryTrack } = useCurrentPlayerTrack();

  const { url: coverBlobUrl } = useTrackCover(libraryTrack);

  const coverUrl = computed(() => {
    if (libraryTrack.value) return coverBlobUrl.value ?? FALLBACK_COVER_URL;
    const cover = isEphemeralTrack(track.value) ? track.value.cover : null;
    return cover ?? FALLBACK_COVER_URL;
  });

  return { track, libraryTrack, coverUrl };
};
