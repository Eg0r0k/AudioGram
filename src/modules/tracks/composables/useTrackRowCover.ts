import { computed, onScopeDispose, toValue, watch, type MaybeRefOrGetter } from "vue";
import { isEphemeralTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import { trackCoverOwner } from "@/modules/covers/composables/useTrackCover";
import { coverCache } from "@/modules/covers/lib/cover-cache";
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
 *  4. the Dexie blob for its album (or the track, when album-less), through
 *     the shared row cache — one batched read for every row mounted in the
 *     same tick, no per-row query observer;
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
  // Only rows that resolve through Dexie hold a cache entry.
  const owner = computed(() => {
    const current = toValue(track);
    if (isEphemeralTrack(current) || current.sourceDto?.coverRef) return null;
    return trackCoverOwner(current);
  });

  let release: (() => void) | null = null;
  watch(owner, (next) => {
    release?.();
    release = next ? coverCache.acquire(next) : null;
  }, { immediate: true });
  onScopeDispose(() => release?.());

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

    const resolvedOwner = owner.value;
    return (resolvedOwner ? coverCache.entryFor(resolvedOwner)?.url : null) ?? FALLBACK;
  });
};
