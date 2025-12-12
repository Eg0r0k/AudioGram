import { AlbumId, PlaylistId } from "@/types/ids";
import { Track } from "@/types/track/track";

export type TrackContext = "default" | "queue" | "playlist" | "album" | "search" | "history" | "liked" | "artist-page";

export interface TrackContextProps {
  track: Track;
  context: TrackContext;
  playlistId?: PlaylistId;
  queueIndex?: number;
  albumId?: AlbumId;
}

export interface ContextActions {
  play: () => void;
  playNext: () => void;
  addToQueue: () => void;
  toggleLike: () => void;
  addToPlaylist: (playlistId: PlaylistId) => void;
  removeFromQueue?: () => void;
  removeFromPlaylist?: () => void;
  removeFromHistory?: () => void;
  goToArtist: () => void;
  goToAlbum: () => void;
  download: () => void;
}
