import { ArtistId, PlaylistId } from "@/types/ids";

// "yt" serves the YT collection/artist pages, "yt-search" the search overlay —
// separate targets because both can be mounted at the same time.
export type TrackContext = "default" | "current-track" | "queue" | "playlist" | "album" | "search" | "history" | "liked" | "artist" | "yt" | "yt-search";

export interface ContextActions {
  play: () => void;
  playNext: () => void;
  addToQueue: () => void;
  showDetails: () => void;
  showLyrics: () => void;
  toggleLike: () => void;
  attachLyrics: () => void;
  addToPlaylist: (playlistId: PlaylistId) => void;
  removeFromQueue?: () => void;
  removeFromPlaylist?: () => void;
  removeFromHistory?: () => void;
  goToArtist: (artistId: ArtistId) => void;
  goToAlbum: () => void;
  download: () => void;
}
