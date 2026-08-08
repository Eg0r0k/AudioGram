import { Channel, invoke } from "@tauri-apps/api/core";
import { ResultAsync } from "neverthrow";
import type {
  YoutubeError,
  YoutubeErrorKind,
  YtDownloadEvent,
  YtDownloadResult,
  YtSearchResult,
} from "../types";

const toYoutubeError = (raw: unknown, kind: YoutubeErrorKind): YoutubeError => {
  if (typeof raw === "string") return { kind, message: raw };
  const message = raw instanceof Error ? raw.message : String(raw);
  return { kind, message };
};

export const searchYoutube = (
  query: string,
  limit?: number,
): ResultAsync<YtSearchResult[], YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<YtSearchResult[]>("yt_search", { query, limit }),
    e => toYoutubeError(e, "SEARCH_FAILED"),
  );

export const resolveYoutube = (
  id: string,
): ResultAsync<string, YoutubeError> =>
  ResultAsync.fromPromise(
    invoke<string>("yt_resolve", { id }),
    e => toYoutubeError(e, "DOWNLOAD_FAILED"),
  );

export const downloadYoutube = (
  id: string,
  onEvent?: (event: YtDownloadEvent) => void,
): ResultAsync<YtDownloadResult, YoutubeError> => {
  const channel = new Channel<YtDownloadEvent>();
  if (onEvent) channel.onmessage = onEvent;

  return ResultAsync.fromPromise(
    invoke<YtDownloadResult>("yt_download", { id, onProgress: channel }),
    e => toYoutubeError(e, "DOWNLOAD_FAILED"),
  );
};
