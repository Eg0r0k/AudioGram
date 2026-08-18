export interface WatchedFolder {
  id: string;
  path: string;
  name: string;
  addedAt: number;
  lastScanAt: number | null;
  fileCount: number;
  status: WatchedFolderStatus;
  errorMessage?: string;
}
export type WatchedFolderStatus
  = | "idle"
    | "scanning"
    | "watching"
    | "error"
    | "missing";

export interface ScannedFile {
  absolutePath: string;
  name: string;
  ext: string;
  size: number;
  modifiedAt: number;
}

export interface SyncResult {
  folderId: string;
  added: number;
  removed: number;
  failed: number;
  errors: Array<{ path: string; message: string }>;
}
