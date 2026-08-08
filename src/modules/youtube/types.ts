export interface YtSearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
}

export interface YtDownloadResult {
  /** Absolute path to the downloaded audio file, ready for the import pipeline. */
  path: string;
}

/** Progress channel payload emitted by the `yt_download` command. */
export type YtDownloadEvent
  = | { type: "progress"; data: { downloaded: number; total: number | null } }
    | { type: "processing" };

export type YoutubeErrorKind
  = | "UNAVAILABLE"
    | "SEARCH_FAILED"
    | "DOWNLOAD_FAILED"
    | "IMPORT_FAILED"
    | "UNKNOWN";

export interface YoutubeError {
  kind: YoutubeErrorKind;
  message: string;
}
