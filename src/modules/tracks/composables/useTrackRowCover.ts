import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
import { THUMB_SIZE_ROW } from "@/lib/media/cover-sizes";
import { sourceCoverUrl, sourceKindOf } from "@/modules/sources/lib/display";

const FALLBACK = "/img/fallback.svg";

/**
 * The cover a track row shows, in precedence order:
 *
 *  1. an explicit override from the page;
 *  2. the source DTO's own art — a remote catalog row has no local blob to
 *     look up, and none appears until a download pins one;
 *  3. an ephemeral track's carried cover (YT streams, radio), which has no
 *     album to look up either;
 *  4. the Dexie blob for its album (or the track, when album-less);
 *  5. the placeholder.
 *
 * Shared because it was duplicated: TrackRow carried rule 2 and TrackExpanded
 * did not, so catalog rows on the album, artist and playlist pages stayed
 * blank until playing them shadow-pinned covers into Dexie — at which point
 * every row filled in at once.
 */
export const useTrackRowCover = (
  track: MaybeRefOrGetter<Track>,
  override?: MaybeRefOrGetter<string | null | undefined>,
) => {
  const { url: blobUrl } = useTrackCover(() => toValue(track));

  return computed(() => {
    const explicit = toValue(override);
    if (explicit) return explicit;

    const current = toValue(track);
    const coverRef = current.sourceDto?.coverRef;
    if (coverRef) {
      return sourceCoverUrl(sourceKindOf(current.id), coverRef, THUMB_SIZE_ROW) || FALLBACK;
    }

    const player = current as PlayerTrack;
    if (isEphemeralTrack(player)) return player.cover ?? FALLBACK;

    return blobUrl.value ?? FALLBACK;
  });
};
