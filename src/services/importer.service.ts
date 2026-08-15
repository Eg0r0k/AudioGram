import { open } from "@tauri-apps/plugin-dialog";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { TrackId } from "@/types/ids";
import { ScannedFile, SyncResult, WatchedFolder } from "@/modules/watched-folders/types";
import { WorkerPool } from "./worker-pool";
import {
  ImportBatchResult,
  ImportControl,
  ImportError,
  ImportErrorCode,
} from "./types";
import { AUDIO_FILE_EXTENSIONS } from "./import/constants";
import { importQueue } from "./import/import-queue";
import { ImportItemIO, fileNameFromPath, itemsFromFiles, itemsFromPaths } from "./import/item-io";
import { MetadataParser } from "./import/metadata-parser";
import { ImportPipeline } from "./import/import-pipeline";
import { FolderSyncService } from "./import/folder-sync";

export type { ImportBatchResult, ImportControl } from "./types";

export interface ImportFilePickerOptions {
  title: string;
  filterName?: string;
  extensions?: string[];
}

/**
 * Facade over the music import subsystem.
 *
 * The actual work is delegated to focused collaborators:
 * - {@link ImportPipeline} — importing files into managed storage;
 * - {@link FolderSyncService} — syncing watched folders (files stay in place);
 * - {@link ImportItemIO} / {@link MetadataParser} — byte access and tag parsing.
 */
export class MusicLibraryEngine {
  private readonly workerPool = new WorkerPool();
  private readonly pipeline: ImportPipeline;
  private readonly folderSync: FolderSyncService;

  private _onTracksImported?: (ids: TrackId[]) => void;

  constructor() {
    const metadataParser = new MetadataParser(this.workerPool);
    this.pipeline = new ImportPipeline({
      itemIO: new ImportItemIO(),
      metadataParser,
      onTracksImported: ids => this._onTracksImported?.(ids),
    });
    this.folderSync = new FolderSyncService({ metadataParser });
  }

  get isNativeImportAvailable(): boolean {
    return hasNativeSupport(storageService);
  }

  onTracksImported(cb: (ids: TrackId[]) => void): void {
    this._onTracksImported = cb;
  }

  async pickFiles(options: ImportFilePickerOptions): Promise<string[] | null> {
    const result = await open({
      multiple: true,
      title: options.title,
      filters: [{
        name: options.filterName ?? "Audio",
        extensions: options.extensions ?? AUDIO_FILE_EXTENSIONS,
      }],
    });
    if (!result) return null;
    return Array.isArray(result) ? result : [result];
  }

  async importFromPaths(
    paths: string[],
    onProgress?: (current: number, total: number) => void,
    control?: ImportControl,
  ): Promise<ImportBatchResult> {
    if (!hasNativeSupport(storageService)) {
      return this.emptyFailResult(paths, "Native support missing");
    }

    await storageService.warmup(["tracks", "lyrics"]);

    return importQueue(() => this.pipeline.run(itemsFromPaths(paths), onProgress, control));
  }

  async importFiles(
    files: File[],
    onProgress?: (current: number, total: number) => void,
    control?: ImportControl,
  ): Promise<ImportBatchResult> {
    return importQueue(() => this.pipeline.run(itemsFromFiles(files), onProgress, control));
  }

  async syncFolder(
    folder: WatchedFolder,
    onProgress?: (current: number, total: number) => void,
    excludedPaths?: string[],
  ): Promise<SyncResult> {
    return importQueue(() => this.folderSync.syncFolder(folder, onProgress, excludedPaths));
  }

  async importSingleExternalFile(file: ScannedFile): Promise<boolean> {
    return importQueue(() => this.folderSync.importSingleExternalFile(file));
  }

  async removeSingleFile(absolutePath: string): Promise<boolean> {
    return this.folderSync.removeSingleFile(absolutePath);
  }

  async cleanupOrphanedFiles(): Promise<number> {
    return this.folderSync.cleanupOrphanedFiles();
  }

  dispose(): void {
    this.workerPool.dispose();
  }

  private emptyFailResult(paths: string[], message: string): ImportBatchResult {
    return {
      successful: [],
      failed: paths.map(p => ({
        fileName: fileNameFromPath(p),
        error: new ImportError(ImportErrorCode.NATIVE_IMPORT_UNAVAILABLE, message),
      })),
      skipped: 0,
      total: paths.length,
    };
  }
}

export const musicLibraryEngine = new MusicLibraryEngine();
