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
