import type { AudioFormat } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

//
// Normalized DTOs. Ids are full branded ids with the source prefix baked in
// ("nd:<id>" / "yt:<id>") — pages and pin flows never see raw remote ids.
//
export interface SourceTrackDTO {
  id: TrackId;
  title: string;
  artistName?: string;
  albumTitle?: string;
  albumId?: AlbumId;
  artistIds?: ArtistId[];
  duration?: number;
  trackNo?: number;
  discNo?: number;
  coverRef?: string;
  format?: AudioFormat;
}

export interface SourceAlbumDTO {
  id: AlbumId;
  title: string;
  artistId?: ArtistId;
  artistName?: string;
  year?: number;
  coverRef?: string;
  trackCount?: number;
}

export interface SourceArtistDTO {
  id: ArtistId;
  name: string;
  albumCount?: number;
  coverRef?: string;
}

export interface SourcePlaylistDTO {
  id: PlaylistId;
  name: string;
  trackCount: number;
  coverRef?: string;
}

export type SourceErrorKind
  = | "UNAVAILABLE"
    | "AUTH"
    | "NETWORK"
    | "NOT_FOUND"
    | "PARSE"
    | "CANCELLED"
    | "UNKNOWN";

export interface SourceError {
  kind: SourceErrorKind;
  message: string;
}
