import { stat } from "@tauri-apps/plugin-fs";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import {
  computeFileFingerprint,
  computeFileFingerprintFromBlob,
} from "@/modules/watched-folders/services/file-fingerprint";
import { StorageError } from "@/db/errors/storage.errors";
import { ResultAsync } from "neverthrow";
import { ImportError, ImportItem } from "../types";
import { HEAD_READ_SIZE, MAX_METADATA_READ } from "./constants";

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? "unknown";
}

export function extensionOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function itemsFromPaths(paths: string[]): ImportItem[] {
  return paths.map(path => ({
    type: "native" as const,
    name: fileNameFromPath(path),
    ext: extensionOf(path),
    path,
    fileSize: 0,
  }));
}

export function itemsFromFiles(files: File[]): ImportItem[] {
  return files.map(file => ({
    type: "web" as const,
    name: file.name,
    ext: extensionOf(file.name),
    file,
    fileSize: file.size,
  }));
}

/**
 * All byte-level access to an {@link ImportItem}.
 * Encapsulates the native (Tauri FS) vs web (File API) branching so the
 * pipeline never has to care where the bytes come from.
 */
export class ImportItemIO {
  /** Returns `null` when a fingerprint cannot be computed; import proceeds without dedup. */
  async computeFingerprint(item: ImportItem): Promise<string | null> {
    try {
      if (item.type === "native" && item.path && hasNativeSupport(storageService)) {
        if (item.fileSize <= 0) {
          try {
            item.fileSize = (await stat(item.path)).size;
          }
          catch { /* keep 0 — fingerprint falls back to head-only hashing */ }
        }
        return await computeFileFingerprint(item.path, item.fileSize);
      }
      if (item.type === "web" && item.file) {
        return await computeFileFingerprintFromBlob(item.file);
      }
      return null;
    }
    catch {
      return null;
    }
  }

  /** Reads the head of the file (bounded by {@link MAX_METADATA_READ}) for metadata parsing. */
  async readHeadBytes(item: ImportItem): Promise<Uint8Array> {
    if (item.type === "native" && hasNativeSupport(storageService) && item.path) {
      const readSize = item.fileSize > 0
        ? Math.min(item.fileSize, MAX_METADATA_READ)
        : HEAD_READ_SIZE;

      const res = await storageService.readBytes(item.path, readSize);
      if (res.isErr()) throw ImportError.readFailed(item.name, res.error);
      return res.value;
    }
    if (item.type === "web" && item.file) {
      try {
        return new Uint8Array(await item.file.arrayBuffer());
      }
      catch (e) {
        throw ImportError.readFailed(item.name, e);
      }
    }
    throw ImportError.nativeImportUnavailable(item.name);
  }

  /** Copies the item's payload into managed storage at `targetPath`. */
  async copyToStorage(item: ImportItem, targetPath: string): Promise<void> {
    let result: ResultAsync<string, StorageError>;

    if (item.type === "native" && hasNativeSupport(storageService) && item.path) {
      result = storageService.importFile(item.path, targetPath);
    }
    else if (item.type === "web" && item.file) {
      result = storageService.saveFile(targetPath, item.file);
    }
    else {
      throw ImportError.storageFailed(item.name, "Invalid item state");
    }

    const res = await result;
    if (res.isErr()) throw ImportError.storageFailed(item.name, res.error);
  }
}
