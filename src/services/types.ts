import type { TrackSource } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import type { BaseMetadata } from "@/workers/types";

export enum ImportErrorCode {
  PARSE_FAILED = "PARSE_FAILED",
  STORAGE_FAILED = "STORAGE_FAILED",
  DATABASE_FAILED = "DATABASE_FAILED",
  WORKER_TIMEOUT = "WORKER_TIMEOUT",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",
  UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT",
  NATIVE_IMPORT_UNAVAILABLE = "NATIVE_IMPORT_UNAVAILABLE",
  READ_FAILED = "READ_FAILED",
  CANCELLED = "CANCELLED",
}

export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly fileName?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ImportError";
  }

  static parseFailed(fileName: string, cause?: unknown): ImportError {
    return new ImportError(ImportErrorCode.PARSE_FAILED, `Parse failed: ${fileName}`, fileName, cause);
  }

  static storageFailed(fileName: string, cause?: unknown): ImportError {
    return new ImportError(ImportErrorCode.STORAGE_FAILED, `Storage failed: ${fileName}`, fileName, cause);
  }

  static databaseFailed(fileName: string, cause?: unknown): ImportError {
    return new ImportError(ImportErrorCode.DATABASE_FAILED, `DB failed: ${fileName}`, fileName, cause);
  }

  static workerTimeout(fileName: string): ImportError {
    return new ImportError(ImportErrorCode.WORKER_TIMEOUT, `Timeout: ${fileName}`, fileName);
  }

  static unsupportedFormat(fileName: string, format: string): ImportError {
    return new ImportError(ImportErrorCode.UNSUPPORTED_FORMAT, `Unsupported: ${format}: ${fileName}`, fileName);
  }

  static readFailed(fileName: string, cause?: unknown): ImportError {
    return new ImportError(ImportErrorCode.READ_FAILED, `Read failed: ${fileName}`, fileName, cause);
  }

  static cancelled(fileName: string): ImportError {
    return new ImportError(ImportErrorCode.CANCELLED, `Import cancelled: ${fileName}`, fileName);
  }

  static nativeImportUnavailable(fileName: string): ImportError {
    return new ImportError(ImportErrorCode.NATIVE_IMPORT_UNAVAILABLE, `Native import unavailable: ${fileName}`, fileName);
  }
}

export interface ImportSuccess {
  trackId: TrackId;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  storagePath?: string;
  fingerprint?: string;
  source?: TrackSource;
  meta?: BaseMetadata;
}

export interface ImportBatchResult {
  successful: ImportSuccess[];
  failed: Array<{ fileName: string; error: ImportError }>;
  skipped: number;
  total: number;
  cancelled?: boolean;
  timings?: Record<string, number>;
}

export interface ImportControl {
  waitIfPaused?: () => Promise<void>;
  isCancelled?: () => boolean;
}

export interface ImportItem {
  type: "native" | "web";
  name: string;
  ext: string;
  file?: File;
  path?: string;
  fileSize: number;
  fingerprint?: string;
}

export interface TrackToSave {
  trackId: TrackId;
  fileName: string;
  storagePath: string;
  fingerprint: string;
  source: TrackSource;
  meta: BaseMetadata;
}
