import { computed, type MaybeRefOrGetter, toValue } from "vue";
import type { CoverOwnerType } from "@/db/entities";
import type { AlbumId, TrackId } from "@/types/ids";
import { useEntityCover } from "./useEntityCover";

interface TrackCoverSubject {
  id: TrackId;
  albumId: AlbumId;
}

interface CoverOwner {
  ownerType: CoverOwnerType;
  ownerId: string;
}

/**
 * The album owns the cover when the track resolves to one; album-less tracks
 * carry their embedded art under their own id (see track-persister).
 */
export const trackCoverOwner = (track: TrackCoverSubject | null | undefined): CoverOwner | null => {
  if (!track) return null;
  return track.albumId
    ? { ownerType: "album", ownerId: track.albumId }
    : { ownerType: "track", ownerId: track.id };
};

export const useTrackCover = (track: MaybeRefOrGetter<TrackCoverSubject | null | undefined>) => {
  const owner = computed(() => trackCoverOwner(toValue(track)));
  return useEntityCover(() => owner.value?.ownerType ?? null, () => owner.value?.ownerId ?? null);
};
