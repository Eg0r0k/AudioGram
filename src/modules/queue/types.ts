import type { AlbumId, ArtistId, PlaylistId, QueueItemId } from "@/types/ids";
import type { PlayerTrack } from "@/modules/player/types";

export type QueueSource
  = | { type: "album"; albumId: AlbumId }
    | { type: "playlist"; playlistId: PlaylistId }
    | { type: "artist"; artistId: ArtistId }
    | { type: "search" }
    | { type: "history" }
    | { type: "manual" }
    | { type: "recommendation" }
    | { type: "liked" }
    | { type: "allMedia" }
    | { type: "external" }
    | { type: "unknown" };

export interface QueueItem {
  id: QueueItemId;
  track: PlayerTrack;
  source: QueueSource;
  addedAt: number;
  cover?: string | null;
}

/**
 * Canonical queue state — the only thing a mutation writes. Everything the
 * UI reads (queue, currentIndex, currentItem, isShuffled, ...) derives from
 * it, so there is no second copy to keep in sync.
 *
 * `items` is the queue in the order tracks were added; `playbackOrder` is
 * null while unshuffled and otherwise a permutation of every item id;
 * `currentItemId` identifies the playing entry by identity, so removing or
 * reordering around it cannot move the selection.
 */
export interface QueueState {
  items: readonly QueueItem[];
  playbackOrder: readonly QueueItemId[] | null;
  currentItemId: QueueItemId | null;
}

export function isSameQueueSource(left: QueueSource, right: QueueSource): boolean {
  if (left.type !== right.type) return false;

  switch (left.type) {
    case "album":
      return "albumId" in right && left.albumId === right.albumId;
    case "playlist":
      return "playlistId" in right && left.playlistId === right.playlistId;
    case "artist":
      return "artistId" in right && left.artistId === right.artistId;
    case "liked":
    case "allMedia":
    case "history":
    case "search":
    case "manual":
    case "recommendation":
    case "external":
    case "unknown":
      return true;
    default:
      return false;
  }
}
