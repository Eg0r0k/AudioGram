import type {
  AlbumEntity,
  ArtistEntity,
  PlaylistEntity,
  SidebarFolderEntity,
  TrackEntity,
} from "@/db/entities";
import type { Track } from "@/modules/player/types";

export interface AlbumWithTrackCount extends AlbumEntity {
  trackCount: number;
}

export interface ArtistWithTrackCount extends ArtistEntity {
  trackCount: number;
}

export interface LibrarySummaryData {
  artists: ArtistWithTrackCount[];
  albums: AlbumWithTrackCount[];
  playlists: PlaylistEntity[];
  folders: SidebarFolderEntity[];
  likedTracks: TrackEntity[];
}

export interface ArtistPageData {
  artist: ArtistEntity;
  albums: AlbumEntity[];
  tracks: Track[];
}

export interface AlbumPageData {
  album: AlbumEntity;
  artist: ArtistEntity;
  tracks: Track[];
}

export interface PlaylistPageData {
  playlist: PlaylistEntity;
  tracks: Track[];
}

export interface LikedTracksPageData {
  tracks: Track[];
}

export interface TracksIndexPageData {
  tracks: Track[];
  total: number;
  totalDuration: number;
}

export interface PaginatedTracksResult {
  tracks: Track[];
  nextOffset: number | null;
  total: number;
}

export interface PaginatedAlbumsResult {
  albums: AlbumEntity[];
  nextOffset: number | null;
  total: number;
}

export interface PaginatedPlaylistTracksResult {
  tracks: Track[];
  nextOffset: number | null;
  total: number;
}
