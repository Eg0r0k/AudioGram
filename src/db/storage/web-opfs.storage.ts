import type { ResultAsync } from "neverthrow";
import { ok, err, fromPromise, errAsync, okAsync } from "neverthrow";
import type { IFileStorage } from "./IFileStorage";
import { StorageError, StorageErrorCode } from "../errors/storage.errors";
import { getMimeType } from "@/lib/environment/mimeSupport";
import { normalizePath } from "./pathUtils";

export class WebOpfsStorage implements IFileStorage {
  private rootPromise: Promise<FileSystemDirectoryHandle> | null = null;

  private getRoot(): ResultAsync<FileSystemDirectoryHandle, StorageError> {
    if (!this.rootPromise) {
      this.rootPromise = navigator.storage.getDirectory();
    }

    return fromPromise(
      this.rootPromise,
      error => StorageError.permissionDenied("/", error),
    ).mapErr((error) => {
      this.rootPromise = null;
      return error;
    });
  }

  saveFile(path: string, data: Blob | File): ResultAsync<string, StorageError> {
    const normalized = normalizePath(path);
    return this.getRoot()
      .andThen(root => this.resolvePath(root, normalized, true))
      .andThen(({ dirHandle, filename }) =>
        fromPromise(
          (async () => {
            const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();

            try {
              await writable.write(data);
              await writable.close();
            }
            catch (e) {
              await writable.abort().catch(() => {});
              throw e;
            }

            return normalized;
          })(),
          error => StorageError.writeFailed(path, error),
        ),
      );
  }

  getFile(path: string): ResultAsync<File, StorageError> {
    return this.getRoot()
      .andThen(root => this.resolvePath(root, path, false))
      .andThen(({ dirHandle, filename }) =>
        fromPromise(
          dirHandle.getFileHandle(filename).then(async (h) => {
            const file = await h.getFile();
            if (file.type) return file;

            return new File([file], file.name, {
              type: getMimeType(path) || "audio/mpeg",
            });
          }),
          error =>
            this.isNotFoundError(error)
              ? StorageError.fileNotFound(path, error)
              : StorageError.readFailed(path, error),
        ),
      );
  }

  getAudioUrl(path: string): ResultAsync<string, StorageError> {
    return okAsync(`/opfs/${encodeURIComponent(normalizePath(path))}`);
  }

  deleteFile(path: string): ResultAsync<void, StorageError> {
    return this.getRoot()
      .andThen(root =>
        this.resolvePath(root, path, false).orElse(error =>
          error.code === StorageErrorCode.FILE_NOT_FOUND
            ? ok({ dirHandle: root, filename: "", skip: true } as const)
            : err(error),
        ),
      )
      .andThen((result) => {
        if ("skip" in result) {
          return ok(undefined);
        }

        return fromPromise(
          result.dirHandle.removeEntry(result.filename),
          error =>
            this.isNotFoundError(error)
              ? null
              : StorageError.deleteFailed(path, error),
        ).orElse(error => (error === null ? ok(undefined) : err(error)));
      });
  }

  listFiles(folder: string): ResultAsync<string[], StorageError> {
    const normalized = normalizePath(folder);
    return this.getRoot().andThen(root =>
      fromPromise(
        (async () => {
          const dirHandle = await root.getDirectoryHandle(normalized);
          const files: string[] = [];

          // @ts-expect-error - values() exists in browser
          for await (const handle of dirHandle.values()) {
            if (handle.kind === "file") {
              files.push(`${normalized}/${handle.name}`);
            }
          }

          return files;
        })(),
        error =>
          this.isNotFoundError(error) ? null : StorageError.readFailed(normalized, error),
      ).orElse(error => (error === null ? ok([]) : err(error))),
    );
  }

  private resolvePath(
    root: FileSystemDirectoryHandle,
    path: string,
    create: boolean,
  ): ResultAsync<{ dirHandle: FileSystemDirectoryHandle; filename: string }, StorageError> {
    const parts = normalizePath(path).split("/").filter(Boolean);
    const filename = parts.pop();

    if (!filename) {
      return errAsync(StorageError.invalidPath(path));
    }

    return fromPromise(
      (async () => {
        let currentDir = root;

        for (const dirName of parts) {
          currentDir = await currentDir.getDirectoryHandle(dirName, { create });
        }

        return { dirHandle: currentDir, filename };
      })(),
      error =>
        this.isNotFoundError(error)
          ? StorageError.fileNotFound(path, error)
          : StorageError.readFailed(path, error),
    );
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof DOMException
      && (error.name === "NotFoundError" || error.name === "TypeMismatchError")
    );
  }

  getFileSize(path: string): ResultAsync<number, StorageError> {
    return this.getRoot()
      .andThen(root => this.resolvePath(root, path, false))
      .andThen(({ dirHandle, filename }) =>
        fromPromise(
          dirHandle.getFileHandle(filename).then(h => h.getFile()).then(f => f.size),
          error =>
            this.isNotFoundError(error)
              ? StorageError.fileNotFound(path, error)
              : StorageError.readFailed(path, error),
        ),
      );
  }
}
