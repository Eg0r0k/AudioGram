import { AlbumId, ArtistId, PlaylistId, RadioStationId, SidebarFolderId, TagId, TrackId } from "@/types/ids";

export enum TrackSource {
  LOCAL_INTERNAL = "local_internal",
  LOCAL_EXTERNAL = "local_external",
  REMOTE_HLS = "remote_hls",
  REMOTE_SUBSONIC = "remote_subsonic",
  REMOTE_YT = "remote_yt",
}

//
// 1 — the row is a full library member, visible on library pages.
// 0 — shadow row: exists only so history/stats/queue persistence have valid
// FKs for a remote track that was merely played from browsing.
// Numeric (not boolean) because Dexie cannot index booleans.
//
export type PinnedFlag = 0 | 1;

export enum TrackState {
  READY,
  BROKEN,
}

export interface AudioFormat {
  codec?: string;
  bitrate?: number;
  sampleRate?: number;
  lossless?: boolean;
  channels?: number;
}

export interface TagEntity {
  id: TagId;
  name: string;
}

export interface ArtistEntity {
  id: ArtistId;
  name: string;
  bio?: string;
  pinned: PinnedFlag;
  addedAt: number;
  updatedAt: number;
}

export interface AlbumEntity {
  id: AlbumId;
  title: string;
  artistId: ArtistId;
  year?: number;
  pinned: PinnedFlag;
  addedAt: number;
  updatedAt: number;
}

export interface PlaylistEntity {
  id: PlaylistId;
  name: string;
  description?: string;
  trackIds: TrackId[];
  addedAt: number;
  updatedAt: number;
}

export type SidebarFolderItemType = "artist" | "album" | "playlist";

export interface SidebarFolderEntryEntity {
  type: SidebarFolderItemType;
  id: string;
}

export interface SidebarFolderEntity {
  id: SidebarFolderId;
  name: string;
  items: SidebarFolderEntryEntity[];
  addedAt: number;
  updatedAt: number;
}

export interface TrackEntity {
  id: TrackId;
  title: string;
  artistName?: string;
  albumTitle?: string;
  artistIds: ArtistId[];
  albumId: AlbumId;
  tagIds: TagId[];
  source: TrackSource;
  /** Empty for remote tracks; an offline copy's path lives in offlineCopies. */
  storagePath?: string;
  pinned: PinnedFlag;
  state: TrackState;
  duration: number;
  format: AudioFormat;
  trackNo?: number;
  diskNo?: number;
  likedAt?: number;
  playCount: number;
  lastPlayedAt?: number;
  addedAt: number;
  fingerprint?: string;
  lyricsPath?: string;

  integratedLufs?: number;
  truePeakDbtp?: number;
  replayGainDb?: number;
  replayPeak?: number;
}

export interface ListenEventEntity {
  id: string;
  trackId: TrackId;
  artistId: ArtistId;
  albumId: AlbumId;
  startedAt: number;
  secondsListened: number;
  trackDuration: number;
  completed: boolean;
  skipped: boolean;
}

export type CoverOwnerType = "album" | "playlist" | "artist";

export interface CoverEntity {
  id: string;
  ownerType: CoverOwnerType;
  ownerId: string;
  blob: Blob;
  mimeType: string;
  addedAt: number;
  updatedAt: number;
}

export interface RadioStationEntity {
  id: RadioStationId;
  name: string;
  streamUrl: string;
  addedAt: number;
  faviconUrl?: string;
  isFavorite: boolean;
  country?: string;
  updatedAt: number;
  lastPlayedAt?: number;
}

export interface AudioFeaturesEntity {
  trackId: TrackId;
  bpm: number;
  // Range 0-1 (Already normalized)
  energy: number;
  spectralCentroid: number;
  // Range 0-1 (Already normalized)
  danceability: number;
  // Tonic according to Krumhansl: 0=C, 1=C#, 2=D, ..., 11=B
  // Normalization: value / 11
  key: number;

  // Mode: 0 = minor, 1 = major
  // No normalization needed (already 0 or 1)
  mode: number;

  analyzedAt: number;
  algorithmVersion: number;
}

//
// Offline copy of a remote track — a separate entity so downloading/removing
// the copy never mutates the track row itself.
//
export interface OfflineCopyEntity {
  trackId: TrackId;
  storagePath: string;
  sizeBytes: number;
  format: AudioFormat;
  downloadedAt: number;
}

export type DownloadJobStatus = "queued" | "running" | "done" | "error";

/** Persisted download queue entry — survives app restarts. */
export interface DownloadJobEntity {
  id: string;
  trackId: TrackId;
  status: DownloadJobStatus;
  attempts: number;
  error?: string;
  /** Groups jobs spawned by one "download album/playlist" action. */
  batchId?: string;
  addedAt: number;
}

export interface TrackChapterMark {
  time: number;
  title?: string;
}

export interface TrackChapterEntity {
  trackId: TrackId;
  chapters: TrackChapterMark[];
  updatedAt: number;
}
