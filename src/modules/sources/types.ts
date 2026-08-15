import type { ResultAsync } from "neverthrow";
import type { AudioFormat } from "@/db/entities";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";

import type { SourceKind } from "@/types/track-ref";

export interface SourceCapabilities {
  browseArtists: boolean;
  browseAlbums: boolean;
  browsePlaylists: boolean;
  search: boolean;
  /** Can hand over a file for an offline copy. */
  download: boolean;
}

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
  id: string;
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

/**
 * Download progress payload — the same contract the Rust `yt_download`
 * progress channel emits ({@link import("@/modules/youtube/types").YtDownloadEvent}),
 * so the download manager is source-agnostic.
 */
export type DownloadEvent
  = | { type: "progress"; data: { downloaded: number; total: number | null } }
    | { type: "processing" };

export interface SourceProvider {
  readonly id: SourceKind;
  readonly capabilities: SourceCapabilities;
  /** Platform + settings gate (IS_TAURI, ND configured, …). */
  readonly isAvailable: boolean;

  listArtists(): ResultAsync<SourceArtistDTO[], SourceError>;
  listAlbums(p: { offset: number; limit: number; sort: "alpha" | "newest" }):
  ResultAsync<SourceAlbumDTO[], SourceError>;
  getAlbum(id: AlbumId): ResultAsync<{ album: SourceAlbumDTO; tracks: SourceTrackDTO[] }, SourceError>;
  /**
   * `topTracks` is best-effort: sources without a "top songs" notion (or a
   * server that returns none) hand back undefined/empty — the artist page
   * then stays albums-only.
   */
  getArtist(id: ArtistId): ResultAsync<{
    artist: SourceArtistDTO;
    albums: SourceAlbumDTO[];
    topTracks?: SourceTrackDTO[];
  }, SourceError>;
  listPlaylists(): ResultAsync<SourcePlaylistDTO[], SourceError>;
  getPlaylist(id: string): ResultAsync<{ playlist: SourcePlaylistDTO; tracks: SourceTrackDTO[] }, SourceError>;
  search(q: string, types: ("track" | "album" | "artist")[], p: { offset: number; limit: number }):
  ResultAsync<{ tracks: SourceTrackDTO[]; albums: SourceAlbumDTO[]; artists: SourceArtistDTO[] }, SourceError>;

  /** Metadata snapshot for pin / revalidate-on-view. */
  getTrack(id: TrackId): ResultAsync<SourceTrackDTO, SourceError>;
  /** Synchronously builds the proxied cover URL for a DTO's coverRef. */
  coverUrl(coverRef: string, size?: number): string;
  resolveStreamUrl(id: TrackId): ResultAsync<string, SourceError>;
  downloadToFile(id: TrackId, onProgress?: (e: DownloadEvent) => void):
  ResultAsync<{ path: string; format?: AudioFormat }, SourceError>;
  /**
   * Flags an in-flight downloadToFile as cancelled — that call then fails
   * with kind "CANCELLED". Optional: sources without cancellable
   * downloads simply omit it. // добавлен в M4: отмена активной загрузки
   */
  cancelDownload?(id: TrackId): ResultAsync<void, SourceError>;
}
