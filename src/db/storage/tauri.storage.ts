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
import { convertFileSrc } from "@tauri-apps/api/core";

import type { IFileStorageWithNativeSupport } from "./IFileStorage";
import { StorageError } from "../errors/storage.errors";
import { normalizePath } from "./pathUtils";

export class TauriStorage implements IFileStorageWithNativeSupport {
  private readonly baseDir = BaseDirectory.AppData;

  private appDataCache: string | null = null;
  private createdDirs = new Set<string>();

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
      const appData = await this.getAppDataDir();
      const destPath = this.joinPath(appData, target);

      await copyFile(sourceAbsPath, destPath);
      return target;
    })(), e => StorageError.writeFailed(targetRelPath, e));
  }

  readFile(absolutePath: string): ResultAsync<Uint8Array, StorageError> {
    return fromPromise(
      readFile(absolutePath),
      e => StorageError.readFailed(absolutePath, e),
    );
  }

  readBytes(absolutePath: string, length: number): ResultAsync<Uint8Array, StorageError> {
    return fromPromise((async () => {
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

        if (this.isAbsolutePath(normalizedPath)) {
          return convertFileSrc(normalizedPath);
        }

        const appData = await this.getAppDataDir();
        return convertFileSrc(this.joinPath(appData, normalizedPath));
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
