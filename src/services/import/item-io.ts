import { stat } from "@tauri-apps/plugin-fs";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import {
  computeFileFingerprint,
  computeFileFingerprintFromBlob,
} from "./file-fingerprint";
import type { StorageError } from "@/db/errors/storage.errors";
import { extensionForAudioMimeType } from "@/lib/environment/mimeSupport";
import type { ResultAsync } from "neverthrow";
import type { ImportItem } from "../types";
import { ImportError } from "../types";
import { HEAD_READ_SIZE, MAX_METADATA_READ } from "./constants";

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? "unknown";
}

/**
 * Extension of a file name or full path, lowercased, without the dot.
 * Returns `""` when the name carries none — a directory component containing a
 * dot must not be mistaken for one.
 */
export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
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
    // A dropped file may carry no extension while its MIME type is known;
    // the extension ends up in the managed storage path, so fall back to it.
    ext: extensionOf(file.name) || extensionForAudioMimeType(file.type),
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
        // Same cap as the native branch above: tags live in the head, and
        // reading whole files would put PROCESS_CONCURRENCY of them in memory
        // at once — hundreds of MB for a folder of lossless albums.
        const source = item.file.size > MAX_METADATA_READ
          ? item.file.slice(0, MAX_METADATA_READ)
          : item.file;
        return new Uint8Array(await source.arrayBuffer());
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
