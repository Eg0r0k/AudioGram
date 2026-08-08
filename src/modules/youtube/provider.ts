import { ResultAsync, errAsync } from "neverthrow";
import { IS_MOBILE, IS_TAURI } from "@/lib/environment/userAgent";
import type {
  YoutubeError,
  YtDownloadEvent,
  YtDownloadResult,
  YtSearchResult,
} from "./types";
import { downloadYoutube, resolveYoutube, searchYoutube } from "./api/youtubeApi";

/**
 * Platform-agnostic YouTube access. Desktop resolves through the Rust
 * Innertube client (rustypipe), fully anonymous — no cookies or login;
 * web/mobile stay behind {@link noopProvider} until a self-hosted
 * Piped/Invidious backend is wired up.
 */
export interface YoutubeProvider {
  readonly isAvailable: boolean;
  search(query: string, limit?: number): ResultAsync<YtSearchResult[], YoutubeError>;
  resolve(id: string): ResultAsync<string, YoutubeError>;
  download(
    id: string,
    onEvent?: (event: YtDownloadEvent) => void,
  ): ResultAsync<YtDownloadResult, YoutubeError>;
}

const unavailable = <T>(): ResultAsync<T, YoutubeError> =>
  errAsync<T, YoutubeError>({
    kind: "UNAVAILABLE",
    message: "YouTube is only available in the desktop app",
  });

const desktopProvider: YoutubeProvider = {
  isAvailable: true,
  search: (query, limit) => searchYoutube(query, limit),
  resolve: id => resolveYoutube(id),
  download: (id, onEvent) => downloadYoutube(id, onEvent),
};

const noopProvider: YoutubeProvider = {
  isAvailable: false,
  search: () => unavailable<YtSearchResult[]>(),
  resolve: () => unavailable<string>(),
  download: () => unavailable<YtDownloadResult>(),
};

export const youtubeProvider: YoutubeProvider
  = IS_TAURI && !IS_MOBILE ? desktopProvider : noopProvider;
