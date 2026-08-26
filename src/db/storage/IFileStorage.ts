import type { ResultAsync } from "neverthrow";
import type { StorageError } from "../errors/storage.errors";

export interface IFileStorage {
  saveFile(path: string, data: Blob | ArrayBuffer | Uint8Array): ResultAsync<string, StorageError>;
  deleteFile(path: string): ResultAsync<void, StorageError>;
  getFile(path: string): ResultAsync<File | Blob, StorageError>;
  getAudioUrl(path: string): ResultAsync<string, StorageError>;
  listFiles(folder: string): ResultAsync<string[], StorageError>;
  getFileSize(path: string): ResultAsync<number, StorageError>;
}

export interface IFileStorageWithNativeSupport extends IFileStorage {
  warmup(folders: string[]): Promise<void>;
  importFile(sourceAbsPath: string, targetRelPath: string): ResultAsync<string, StorageError>;

  // Backed by a plain ArrayBuffer (never shared), so the bytes can go
  // straight into Blob / crypto.subtle without a copy or a cast.
  readFile(absolutePath: string): ResultAsync<Uint8Array<ArrayBuffer>, StorageError>;
  readBytes(absolutePath: string, length: number): ResultAsync<Uint8Array<ArrayBuffer>, StorageError>;

  getAppDataDir(): Promise<string>;
  clearCaches(): void;
}

export function hasNativeSupport(
  storage: IFileStorage,
): storage is IFileStorageWithNativeSupport {
  return "importFile" in storage;
}
