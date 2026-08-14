import { Channel, invoke } from "@tauri-apps/api/core";
import { ResultAsync } from "neverthrow";
import type {
  YoutubeError,
  YoutubeErrorKind,
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
} from "../types";

/** Backend `YtErrorKind` values that map 1:1 onto frontend kinds. */
const BACKEND_KIND_MAP: Partial<Record<string, YoutubeErrorKind>> = {
  NOT_FOUND: "NOT_FOUND",
  // Backend UNAVAILABLE = geoblocked/premium/private content; the frontend
  // reserves plain UNAVAILABLE for "no YouTube on this platform".
  UNAVAILABLE: "UNAVAILABLE_REGION",
  NETWORK: "NETWORK",
  CANCELLED: "CANCELLED",
};

const isStructuredError = (raw: unknown): raw is { kind: string; message: string } =>
  typeof raw === "object" && raw !== null && "kind" in raw && "message" in raw;

const toYoutubeError = (raw: unknown, fallbackKind: YoutubeErrorKind): YoutubeError => {
  if (isStructuredError(raw)) {
    return { kind: BACKEND_KIND_MAP[raw.kind] ?? fallbackKind, message: raw.message };
  }
  if (typeof raw === "string") return { kind: fallbackKind, message: raw };
  const message = raw instanceof Error ? raw.message : String(raw);
  return { kind: fallbackKind, message };
};

export const searchYoutube = (
  query: string,
): ResultAsync<YtSearchResult[], YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<{ items: YtSearchResult[] }>("yt_search", { query }).then(page => page.items),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const resolveYoutube = (
  id: string,
): ResultAsync<string, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<string>("yt_resolve", { id }),
    e => toYoutubeError(e, "DOWNLOAD_FAILED"),
  );

/** Downloads the whole audio into the backend prefetch cache (next-track warm-up). */
export const prefetchYoutube = (
  id: string,
): ResultAsync<void, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<void>("yt_prefetch", { id }),
    e => toYoutubeError(e, "NETWORK"),
  );

export const downloadYoutube = (
  id: string,
  onEvent?: (event: YtDownloadEvent) => void,
  meta?: YtTrackMeta,
): ResultAsync<YtDownloadResult, YoutubeError> => {
  const channel = new Channel<YtDownloadEvent>();
  if (onEvent) channel.onmessage = onEvent;

  return ResultAsync.fromPromise(
    invoke<YtDownloadResult>("yt_download", { id, meta: meta ?? null, onProgress: channel }),
    e => toYoutubeError(e, "DOWNLOAD_FAILED"),
  );
};

export const cancelYoutubeDownload = (id: string): ResultAsync<void, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<void>("yt_download_cancel", { id }),
    e => toYoutubeError(e, "DOWNLOAD_FAILED"),
  );

export const searchYoutubeVideosPage = (
  query: string,
): ResultAsync<YtPage<YtSearchResult>, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtPage<YtSearchResult>>("yt_search", { query }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const continueYoutubeVideos = (
  continuation: string,
): ResultAsync<YtPage<YtSearchResult>, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtPage<YtSearchResult>>("yt_search_continue", { continuation }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const searchYoutubeMusic = (
  query: string,
  kind: YtMusicSearchKind,
): ResultAsync<YtPage<YtMusicEntity>, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtPage<YtMusicEntity>>("yt_music_search", { query, kind }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const continueYoutubeMusic = (
  continuation: string,
  kind: YtMusicSearchKind,
): ResultAsync<YtPage<YtMusicEntity>, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtPage<YtMusicEntity>>("yt_continue", { continuation, kind }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const getYoutubePlaylist = (
  id: string,
): ResultAsync<YtPlaylistDetail, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtPlaylistDetail>("yt_music_playlist", { id }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const getYoutubeAlbum = (
  id: string,
): ResultAsync<YtAlbumDetail, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtAlbumDetail>("yt_music_album", { id }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const getYoutubeArtist = (
  id: string,
): ResultAsync<YtArtistDetail, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtArtistDetail>("yt_music_artist", { id }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );
