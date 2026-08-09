export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body: string | null;
  date: string | null;
}

export interface DownloadProgress {
  chunkLength: number;
  contentLength: number | null;
}

export type UpdateStatus
  = | "idle"
    | "checking"
    | "available"
    | "up-to-date"
    | "downloading"
    | "installing"
    | "error";

export type UpdateErrorKind
  = | "NETWORK"
    | "INVALID_CHANNEL"
    | "NO_UPDATE_AVAILABLE"
    | "INSTALL_FAILED"
    | "UNKNOWN";

export interface UpdateError {
  kind: UpdateErrorKind;
  message: string;
}

export type UpdateChannel = "stable";

/** Service Worker equivalents of the Tauri check/install commands. */
export interface PwaUpdateHandlers {
  check: () => Promise<void>;
  apply: () => Promise<void>;
}
