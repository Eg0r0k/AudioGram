import type { ResultAsync } from "neverthrow";
import type { AudioFormat } from "@/db/entities";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import type {
  SourceAlbumDTO,
  SourceArtistDTO,
  SourceError,
  SourcePlaylistDTO,
  SourceTrackDTO,
} from "@/types/source-dto";

import type { SourceKind } from "@/types/track-ref";

// Live in @/types so services and queries can use them without importing this module.
export type {
  SourceAlbumDTO,
  SourceArtistDTO,
  SourceError,
  SourceErrorKind,
  SourcePlaylistDTO,
  SourceTrackDTO,
} from "@/types/source-dto";

export interface SourceCapabilities {
  browseArtists: boolean;
  browseAlbums: boolean;
  browsePlaylists: boolean;
  search: boolean;
  /** Can hand over a file for an offline copy. */
  download: boolean;
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
  getArtist(id: ArtistId): ResultAsync<{ artist: SourceArtistDTO; albums: SourceAlbumDTO[] }, SourceError>;
  listPlaylists(): ResultAsync<SourcePlaylistDTO[], SourceError>;
  getPlaylist(id: string): ResultAsync<{ playlist: SourcePlaylistDTO; tracks: SourceTrackDTO[] }, SourceError>;
  search(q: string, types: ("track" | "album" | "artist")[], p: { offset: number; limit: number }):
  ResultAsync<{ tracks: SourceTrackDTO[]; albums: SourceAlbumDTO[]; artists: SourceArtistDTO[] }, SourceError>;

  /** Metadata snapshot for pin / revalidate-on-view. */
  getTrack(id: TrackId): ResultAsync<SourceTrackDTO, SourceError>;
  /** Synchronously builds the proxied cover URL for a DTO's coverRef. */
  coverUrl(coverRef: string, size?: number): string;
  resolveStreamUrl(id: TrackId): ResultAsync<string, SourceError>;
  /**
   * Warms the backend audio cache for an upcoming queue entry so the
   * `stream://` proxy answers the next track's requests from memory.
   * Optional: sources whose playback needs no warm-up simply omit it.
   */
  prefetch?(id: TrackId): ResultAsync<void, SourceError>;
  downloadToFile(id: TrackId, onProgress?: (e: DownloadEvent) => void):
  ResultAsync<{ path: string; format?: AudioFormat }, SourceError>;
  /**
   * Flags an in-flight downloadToFile as cancelled — that call then fails
   * with kind "CANCELLED". Optional: sources without cancellable
   * downloads simply omit it. // добавлен в M4: отмена активной загрузки
   */
  cancelDownload?(id: TrackId): ResultAsync<void, SourceError>;
}
