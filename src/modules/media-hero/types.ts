import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";

export type MediaType = "playlist" | "artist" | "album" | "liked";

export interface BaseMediaData {
  type: MediaType;
  image: string;
  title: string;
}

export interface PlaylistData extends BaseMediaData {
  type: "playlist";
  id: PlaylistId;
  isOwner: boolean;
  trackCount: number;
  duration?: string;
  description?: string;
  ownerName?: string;
}

export interface ArtistData extends BaseMediaData {
  type: "artist";
  id: ArtistId;
  monthlyListeners: number;
  isFollowing?: boolean;
  bio?: string;
}

export interface AlbumData extends BaseMediaData {
  type: "album";
  id: AlbumId;
  artistName: string;
  artistId: ArtistId;
  releaseYear: number;
  trackCount: number;
  duration?: string;
}

export interface LikedData extends BaseMediaData {
  type: "liked";
  trackCount: number;
  duration?: string;
}

export type MediaData = PlaylistData | ArtistData | AlbumData | LikedData;

export function isPlaylist(data: MediaData): data is PlaylistData {
  return data.type === "playlist";
}

export function isArtist(data: MediaData): data is ArtistData {
  return data.type === "artist";
}

export function isAlbum(data: MediaData): data is AlbumData {
  return data.type === "album";
}

export function isLiked(data: MediaData): data is LikedData {
  return data.type === "liked";
}
