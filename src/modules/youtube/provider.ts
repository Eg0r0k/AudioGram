import { type ResultAsync, errAsync } from "neverthrow";
import { platformCaps } from "@/lib/environment/platformCaps";
import type {
  YoutubeError,
  YtAlbumDetail,
  YtArtistDetail,
  YtDownloadEvent,
  YtDownloadResult,
  YtMusicEntity,
  YtMusicSearchKind,
  YtPage,
  YtPlaylistDetail,
  YtSearchResult,
  YtTrackMeta,
} from "./types";
import {
  cancelYoutubeDownload,
  continueYoutubeMusic,
  continueYoutubeVideos,
  downloadYoutube,
  getYoutubeAlbum,
  getYoutubeArtist,
  getYoutubePlaylist,
  prefetchYoutube,
  resolveYoutube,
  searchYoutube,
  searchYoutubeMusic,
  searchYoutubeVideosPage,
} from "./api/youtubeApi";

/**
 * Platform-agnostic YouTube access. Desktop resolves through the Rust
 * Innertube client (rustypipe), fully anonymous — no cookies or login;
 * web/mobile stay behind {@link noopProvider} until a self-hosted
 * Piped/Invidious backend is wired up.
 */
export interface YoutubeProvider {
  readonly isAvailable: boolean;
  search(query: string): ResultAsync<YtSearchResult[], YoutubeError>;
  searchVideos(query: string): ResultAsync<YtPage<YtSearchResult>, YoutubeError>;
  continueVideos(continuation: string): ResultAsync<YtPage<YtSearchResult>, YoutubeError>;
  searchMusic(
    query: string,
    kind: YtMusicSearchKind,
  ): ResultAsync<YtPage<YtMusicEntity>, YoutubeError>;
  continueMusic(
    continuation: string,
    kind: YtMusicSearchKind,
  ): ResultAsync<YtPage<YtMusicEntity>, YoutubeError>;
  playlist(id: string): ResultAsync<YtPlaylistDetail, YoutubeError>;
  album(id: string): ResultAsync<YtAlbumDetail, YoutubeError>;
  artist(id: string): ResultAsync<YtArtistDetail, YoutubeError>;
  resolve(id: string): ResultAsync<string, YoutubeError>;
  /** Warms the backend audio cache so the track starts instantly when played. */
  prefetch(id: string): ResultAsync<void, YoutubeError>;
  download(
    id: string,
    onEvent?: (event: YtDownloadEvent) => void,
    meta?: YtTrackMeta,
  ): ResultAsync<YtDownloadResult, YoutubeError>;
  cancelDownload(id: string): ResultAsync<void, YoutubeError>;
}

const unavailable = <T>(): ResultAsync<T, YoutubeError> =>
  errAsync<T, YoutubeError>({
    kind: "UNAVAILABLE",
    message: "YouTube is only available in the desktop app",
  });

const desktopProvider: YoutubeProvider = {
  isAvailable: true,
  search: query => searchYoutube(query),
  searchVideos: query => searchYoutubeVideosPage(query),
  continueVideos: continuation => continueYoutubeVideos(continuation),
  searchMusic: (query, kind) => searchYoutubeMusic(query, kind),
  continueMusic: (continuation, kind) => continueYoutubeMusic(continuation, kind),
  playlist: id => getYoutubePlaylist(id),
  album: id => getYoutubeAlbum(id),
  artist: id => getYoutubeArtist(id),
  resolve: id => resolveYoutube(id),
  prefetch: id => prefetchYoutube(id),
  // Retries belong to the download manager (single layer, with backoff) —
  // one provider call is exactly one yt_download run.
  download: (id, onEvent, meta) => downloadYoutube(id, onEvent, meta),
  cancelDownload: id => cancelYoutubeDownload(id),
};

const noopProvider: YoutubeProvider = {
  isAvailable: false,
  search: () => unavailable<YtSearchResult[]>(),
  searchVideos: () => unavailable<YtPage<YtSearchResult>>(),
  continueVideos: () => unavailable<YtPage<YtSearchResult>>(),
  searchMusic: () => unavailable<YtPage<YtMusicEntity>>(),
  continueMusic: () => unavailable<YtPage<YtMusicEntity>>(),
  playlist: () => unavailable<YtPlaylistDetail>(),
  album: () => unavailable<YtAlbumDetail>(),
  artist: () => unavailable<YtArtistDetail>(),
  resolve: () => unavailable<string>(),
  prefetch: () => unavailable<void>(),
  download: () => unavailable<YtDownloadResult>(),
  cancelDownload: () => unavailable<void>(),
};

// yt-dlp is a spawned helper process — desktop only.
export const youtubeProvider: YoutubeProvider
  = platformCaps.canShellSpawn ? desktopProvider : noopProvider;
