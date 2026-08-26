import { ResultAsync, fromPromise } from "neverthrow";
import {
  writeFile,
  remove,
  mkdir,
  exists,
  BaseDirectory,
  readDir,
  copyFile,
  readFile,
  open,
  stat,
} from "@tauri-apps/plugin-fs";
import { appDataDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

import type { IFileStorageWithNativeSupport } from "./IFileStorage";
import { getLogger } from "@/lib/logger";
import { localFileStreamUrl } from "@/lib/stream-url";
import { StorageError } from "../errors/storage.errors";
import { normalizePath } from "./pathUtils";

export class TauriStorage implements IFileStorageWithNativeSupport {
  private readonly baseDir = BaseDirectory.AppData;

  private appDataCache: string | null = null;
  private createdDirs = new Set<string>();
  private mediaServerReadWarned = false;

  async getAppDataDir(): Promise<string> {
    if (!this.appDataCache) {
      this.appDataCache = await appDataDir();
    }
    return this.appDataCache;
  }

  private joinPath(base: string, ...parts: string[]): string {
    const joined = [base, ...parts].join("/");
    return joined.replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  private async ensureDir(folder: string): Promise<void> {
    if (!folder || this.createdDirs.has(folder)) return;

    const folderExists = await exists(folder, { baseDir: this.baseDir });
    if (!folderExists) {
      await mkdir(folder, { baseDir: this.baseDir, recursive: true });
    }
    this.createdDirs.add(folder);
  }

  private isAbsolutePath(path: string): boolean {
    return /^(?:[a-zA-Z]:[\\/]|\/)/.test(path);
  }

  private getFolder(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash > 0 ? path.substring(0, lastSlash) : "";
  }

  async warmup(folders: string[] = ["tracks", "lyrics"]): Promise<void> {
    await this.getAppDataDir();
    await Promise.all(folders.map(f => this.ensureDir(f)));
  }

  importFile(sourceAbsPath: string, targetRelPath: string): ResultAsync<string, StorageError> {
    return fromPromise((async () => {
      const target = normalizePath(targetRelPath);
      await this.ensureDir(this.getFolder(target));

      // Android SAF sources (content://) cannot be std::fs-copied by the fs
      // plugin. The copy runs fully on the Rust side: the JS streaming
      // fallback crosses the WebView IPC bridge once per MiB in each
      // direction, which turns a 250 MB import into minutes on a phone.
      if (sourceAbsPath.startsWith("content://")) {
        try {
          await invoke("import_local_file", { source: sourceAbsPath, targetRel: target });
        }
        catch {
          await this.copyStreaming(sourceAbsPath, target);
        }
      }
      else {
        const appData = await this.getAppDataDir();
        await copyFile(sourceAbsPath, this.joinPath(appData, target));
      }
      return target;
    })(), e => StorageError.writeFailed(targetRelPath, e));
  }

  private async copyStreaming(source: string, targetRelPath: string): Promise<void> {
    const src = await open(source, { read: true });
    try {
      const dest = await open(targetRelPath, {
        write: true,
        create: true,
        truncate: true,
        baseDir: this.baseDir,
      });
      try {
        const buffer = new Uint8Array(1024 * 1024);
        for (;;) {
          const read = await src.read(buffer);
          if (!read) break;
          let chunk = buffer.subarray(0, read);
          while (chunk.length > 0) {
            const written = await dest.write(chunk);
            chunk = chunk.subarray(written);
          }
        }
      }
      finally {
        await dest.close();
      }
    }
    finally {
      await src.close();
    }
  }

  readFile(absolutePath: string): ResultAsync<Uint8Array<ArrayBuffer>, StorageError> {
    return fromPromise(
      readFile(absolutePath),
      e => StorageError.readFailed(absolutePath, e),
    );
  }

  readBytes(absolutePath: string, length: number): ResultAsync<Uint8Array<ArrayBuffer>, StorageError> {
    return fromPromise((async () => {
      const viaServer = await this.readBytesViaMediaServer(absolutePath, length);
      if (viaServer) return viaServer;

      const file = await open(absolutePath, { read: true });
      try {
        const buffer = new Uint8Array(length);

        const bytesRead = await file.read(buffer);
        const count = bytesRead ?? 0;

        return count < length ? buffer.slice(0, count) : buffer;
      }
      finally {
        await file.close();
      }
    })(), e => StorageError.readFailed(absolutePath, e));
  }

  /**
   * Head reads ride the loopback media server: one HTTP Range request instead
   * of a plugin-fs IPC round-trip, which serializes and moves bytes an order
   * of magnitude slower. Returns null when the server is unavailable or
   * refuses the path — the caller then falls back to plugin-fs.
   */
  private async readBytesViaMediaServer(absolutePath: string, length: number): Promise<Uint8Array<ArrayBuffer> | null> {
    if (length <= 0) return null;

    let url: string;
    try {
      // Throws when no server base exists (web build, tests) — there the
      // plugin-fs path is the primary one and no fallback happened.
      url = localFileStreamUrl(absolutePath);
    }
    catch {
      return null;
    }

    try {
      const response = await fetch(url, { headers: { Range: `bytes=0-${length - 1}` } });
      // 416: the file is empty — a successful zero-length read, same as plugin-fs.
      if (response.status === 416) return new Uint8Array(0);
      if (response.status !== 200 && response.status !== 206) {
        this.warnMediaServerFallbackOnce(`status ${response.status}`, absolutePath);
        return null;
      }

      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer.byteLength <= length ? buffer : buffer.slice(0, length));
    }
    catch (e) {
      this.warnMediaServerFallbackOnce(String(e), absolutePath);
      return null;
    }
  }

  /** One warning per session: a per-file log would fire thousands of times during a sync. */
  private warnMediaServerFallbackOnce(reason: string, absolutePath: string): void {
    if (this.mediaServerReadWarned) return;
    this.mediaServerReadWarned = true;
    getLogger().warn(`[Storage] Media-server read failed (${reason}) for ${absolutePath} — falling back to plugin-fs`);
  }

  clearCaches(): void {
    this.createdDirs.clear();
  }

  saveFile(path: string, data: Blob | ArrayBuffer | Uint8Array): ResultAsync<string, StorageError> {
    return fromPromise((async () => {
      const normalized = normalizePath(path);
      await this.ensureDir(this.getFolder(normalized));

      let buffer: Uint8Array;
      if (data instanceof Uint8Array) buffer = data;
      else if (data instanceof Blob) buffer = new Uint8Array(await data.arrayBuffer());
      else buffer = new Uint8Array(data);

      await writeFile(normalized, buffer, { baseDir: this.baseDir });
      return normalized;
    })(), e => StorageError.writeFailed(path, e));
  }

  getFile(path: string): ResultAsync<Blob, StorageError> {
    const normalized = normalizePath(path);
    return fromPromise(
      (async () => {
        if (!(await exists(normalized, { baseDir: this.baseDir }))) {
          throw StorageError.fileNotFound(normalized);
        }
        const data = await readFile(normalized, { baseDir: this.baseDir });
        return new Blob([data]);
      })(),
      error => (error instanceof StorageError ? error : StorageError.readFailed(path, error)),
    );
  }

  getAudioUrl(path: string): ResultAsync<string, StorageError> {
    return fromPromise(
      (async () => {
        const normalizedPath = path.replace(/\\/g, "/");

        const absolutePath = this.isAbsolutePath(normalizedPath)
          ? normalizedPath
          : this.joinPath(await this.getAppDataDir(), normalizedPath);

        // One transport on every platform: the loopback media server. The
        // asset protocol cannot stream on Android (the WebView re-slices
        // intercepted responses and wry buffers the full body — OOM on big
        // files), and a single code path beats two per-platform ones.
        return localFileStreamUrl(absolutePath);
      })(),
      error => StorageError.readFailed(path, error),
    );
  }

  listFiles(folder: string): ResultAsync<string[], StorageError> {
    const normalized = normalizePath(folder);
    return fromPromise(
      (async () => {
        const folderExists = await exists(normalized, { baseDir: this.baseDir });
        if (!folderExists) return [];

        const entries = await readDir(normalized, { baseDir: this.baseDir });
        return entries
          .filter(entry => entry.isFile)
          .map(entry => `${normalized}/${entry.name}`);
      })(),
      error => StorageError.readFailed(folder, error),
    );
  }

  deleteFile(path: string): ResultAsync<void, StorageError> {
    const normalized = normalizePath(path);
    return fromPromise(
      (async () => {
        const fileExists = await exists(normalized, { baseDir: this.baseDir });
        if (fileExists) {
          await remove(normalized, { baseDir: this.baseDir });
        }
      })(),
      error => StorageError.deleteFailed(path, error),
    );
  }

  getFileSize(path: string): ResultAsync<number, StorageError> {
    const normalized = normalizePath(path);
    return fromPromise(
      (async () => {
        if (!(await exists(normalized, { baseDir: this.baseDir }))) {
          throw StorageError.fileNotFound(normalized);
        }
        const meta = await stat(normalized, { baseDir: this.baseDir });
        return meta.size;
      })(),
      error => (error instanceof StorageError ? error : StorageError.readFailed(path, error)),
    );
  }
}
