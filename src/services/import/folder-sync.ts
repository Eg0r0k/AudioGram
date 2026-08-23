import pLimit from "p-limit";
import { ok, err, Result } from "neverthrow";
import { db } from "@/db";
import { unitOfWork } from "@/db/unit-of-work";
import { storageService } from "@/db/storage";
import {
  hasNativeSupport,
  IFileStorageWithNativeSupport,
} from "@/db/storage/IFileStorage";
import { trackRepository } from "@/db/repositories";
import { TrackSource } from "@/db/entities";
import { TrackId } from "@/types/ids";
import { unwrapResult } from "@/lib/result";
import { getLogger } from "@/lib/logger";
import { ScannedFile, SyncResult, WatchedFolder } from "@/types/watched-folders";
import { computeFileFingerprint } from "./file-fingerprint";
import { scanFolder } from "./folder-scanner";
import { EntityResolver } from "../entity-resolver";
import { cleanupAfterTrackRemoval } from "../library-gc";
import { ImportError, TrackToSave } from "../types";
import { DB_BATCH_SIZE, FINGERPRINT_CONCURRENCY, MAX_METADATA_READ, PIPELINE_BATCH_SIZE, PROCESS_CONCURRENCY } from "./constants";
import { initialHeadReadSize, mp3HasVbrHeader } from "./head-read";
import { MetadataParser } from "./metadata-parser";
import { persistTracks } from "./track-persister";
import { chunk } from "@/lib/math";
import { normalizePath } from "@/lib/files/filterFiles";

export interface FolderSyncDeps {
  metadataParser: MetadataParser;
}

/**
 * Keeps watched folders and the library in sync. Tracks imported here stay in
 * place on disk ({@link TrackSource.LOCAL_EXTERNAL}) — nothing is copied into
 * managed storage, unlike the main import pipeline.
 */
export class FolderSyncService {
  private readonly processLimit = pLimit(PROCESS_CONCURRENCY);
  private readonly fpLimit = pLimit(FINGERPRINT_CONCURRENCY);

  constructor(private readonly deps: FolderSyncDeps) {}

  async syncFolder(
    folder: WatchedFolder,
    onProgress?: (current: number, total: number) => void,
    excludedPaths?: string[],
  ): Promise<SyncResult> {
    const result: SyncResult = { folderId: folder.id, added: 0, removed: 0, failed: 0, errors: [] };
    if (!hasNativeSupport(storageService)) return result;

    const { newFiles, removedTracks } = await this.diffFolder(folder, excludedPaths);

    const totalWork = newFiles.length + removedTracks.length;
    let processed = 0;
    onProgress?.(0, totalWork);

    const advance = (by: number) => {
      processed += by;
      onProgress?.(processed, totalWork);
    };

    const filesToImport = await this.dedupeByFingerprint(newFiles, result, advance);

    for (const batch of chunk(filesToImport, PIPELINE_BATCH_SIZE)) {
      const parsed = await this.parseFiles(batch, result);
      if (parsed.length > 0) {
        await this.persistParsed(parsed, folder.path, result, advance);
      }
    }

    if (removedTracks.length > 0) {
      const txResult = await unitOfWork.runScoped(
        [db.tracks, db.albums, db.artists, db.covers],
        async () => {
          await unwrapResult(trackRepository.deleteMany(removedTracks.map(t => t.id)));
          // Cascade: albums/artists that lost their last reference die with them.
          await cleanupAfterTrackRemoval(removedTracks);
        },
      );
      if (txResult.isErr()) throw txResult.error;
      result.removed = removedTracks.length;
      advance(removedTracks.length);
    }

    if (result.added || result.removed || result.failed) {
      getLogger().info(
        `[FolderSync] ${folder.path}: +${result.added} / -${result.removed}, ${result.failed} failed (${newFiles.length} new files scanned)`,
      );
    }

    return result;
  }

  /** Imports one externally-discovered file, skipping known paths/fingerprints. */
  async importSingleExternalFile(file: ScannedFile): Promise<boolean> {
    if (!hasNativeSupport(storageService)) return false;

    const fp = await computeFileFingerprint(file.absolutePath, file.size);
    const [existsByPath, existsByFp] = await Promise.all([
      unwrapResult(trackRepository.findByStoragePath(file.absolutePath)),
      unwrapResult(trackRepository.existsByFingerprint(fp)),
    ]);
    if (existsByPath || existsByFp) return false;

    const trackToSaveResult = await this.parseExternalFile(file, fp);
    if (trackToSaveResult.isErr()) return false;
    const trackToSave = trackToSaveResult.value;

    try {
      const resolver = new EntityResolver();
      await resolver.resolve([trackToSave.meta]);
      await persistTracks([trackToSave], resolver);
      return true;
    }
    catch (e) {
      getLogger().warn(`[FolderSync] Import of ${file.absolutePath} failed: ${String(e)}`);
      return false;
    }
  }

  async removeSingleFile(absolutePath: string): Promise<boolean> {
    const track = await unwrapResult(trackRepository.findByStoragePath(absolutePath));
    if (!track) return false;
    const txResult = await unitOfWork.runScoped(
      [db.tracks, db.albums, db.artists, db.covers],
      async () => {
        await unwrapResult(trackRepository.delete(track.id));
        await cleanupAfterTrackRemoval([track]);
      },
    );
    if (txResult.isErr()) throw txResult.error;
    return true;
  }

  /** Deletes files in managed storage that no track references anymore. */
  async cleanupOrphanedFiles(): Promise<number> {
    if (!hasNativeSupport(storageService)) return 0;
    const nativeStorage = storageService as IFileStorageWithNativeSupport;

    const listResult = await nativeStorage.listFiles("tracks");
    if (listResult.isErr()) return 0;

    const storedPaths = new Set(listResult.value);
    const allTracks = await unwrapResult(trackRepository.findAll());
    const dbPaths = new Set(allTracks.map(t => t.storagePath));

    let removed = 0;
    for (const storedPath of storedPaths) {
      const full = storedPath.startsWith("tracks/") ? storedPath : `tracks/${storedPath}`;
      if (!dbPaths.has(full)) {
        await nativeStorage.deleteFile(full);
        removed++;
      }
    }
    return removed;
  }

  /** Scans the folder and diffs it against the library. */
  private async diffFolder(folder: WatchedFolder, excludedPaths?: string[]) {
    const folderPath = normalizePath(folder.path);
    const normalizedExcluded = (excludedPaths ?? []).map(normalizePath);
    const excludeSet = new Set(normalizedExcluded);
    const scanned = await scanFolder(folderPath, undefined, excludeSet);
    const scannedPaths = new Set(scanned.map(f => f.absolutePath));

    let existingTracks = await unwrapResult(trackRepository.findByStoragePathPrefix(folderPath + "/"));
    if (normalizedExcluded.length) {
      existingTracks = existingTracks.filter(
        t => !normalizedExcluded.some(ep => t.storagePath?.startsWith(ep + "/")),
      );
    }

    const existingPaths = new Set(existingTracks.map(t => t.storagePath));
    return {
      newFiles: scanned.filter(f => !existingPaths.has(f.absolutePath)),
      removedTracks: existingTracks.filter(t => t.storagePath != null && !scannedPaths.has(t.storagePath)),
    };
  }

  /** Drops files whose fingerprint is already in the library or earlier in this sync. */
  private async dedupeByFingerprint(
    newFiles: ScannedFile[],
    result: SyncResult,
    advance: (by: number) => void,
  ): Promise<Array<{ file: ScannedFile; fingerprint: string }>> {
    // Own fingerprint registry — not shared with any concurrent import.
    const knownFingerprints = await unwrapResult(trackRepository.getAllFingerprints());

    // Fingerprints compute concurrently; dedupe below walks the results in the
    // original file order, so which of two duplicates wins stays deterministic.
    const fpResults = await Promise.all(
      newFiles.map(file =>
        this.fpLimit(async () => {
          try {
            return { file, fp: await computeFileFingerprint(file.absolutePath, file.size) };
          }
          catch (e) {
            getLogger().warn(`[FolderSync] Fingerprint failed for ${file.absolutePath}: ${String(e)}`);
            return { file, fp: null };
          }
          finally {
            advance(1);
          }
        }),
      ),
    );

    const filesToImport: Array<{ file: ScannedFile; fingerprint: string }> = [];
    for (const { file, fp } of fpResults) {
      if (fp === null) {
        result.failed++;
        continue;
      }
      if (!knownFingerprints.has(fp)) {
        knownFingerprints.add(fp);
        filesToImport.push({ file, fingerprint: fp });
      }
    }

    return filesToImport;
  }

  private async parseFiles(
    filesToImport: Array<{ file: ScannedFile; fingerprint: string }>,
    result: SyncResult,
  ): Promise<TrackToSave[]> {
    const parsed: TrackToSave[] = [];
    const parseResults = await Promise.all(
      filesToImport.map(({ file, fingerprint }) =>
        this.processLimit(() => this.parseExternalFile(file, fingerprint)),
      ),
    );
    for (const r of parseResults) {
      if (r.isOk()) {
        parsed.push(r.value);
      }
      else {
        result.failed++;
        getLogger().warn(`[FolderSync] ${r.error.fileName ?? "unknown"}: ${r.error.message}`);
      }
    }
    return parsed;
  }

  private async persistParsed(
    parsed: TrackToSave[],
    folderPath: string,
    result: SyncResult,
    advance: (by: number) => void,
  ): Promise<void> {
    // Own EntityResolver — no shared state with concurrent imports.
    const resolver = new EntityResolver();
    await resolver.resolve(parsed.map(p => p.meta));

    for (const batch of chunk(parsed, DB_BATCH_SIZE)) {
      try {
        const saved = await persistTracks(batch, resolver);
        result.added += saved.length;
      }
      catch (e) {
        result.failed += batch.length;
        result.errors.push({ path: folderPath, message: `DB batch failed: ${String(e)}` });
        getLogger().error(`[FolderSync] DB batch of ${batch.length} tracks failed: ${String(e)}`);
      }
      advance(batch.length);
    }
  }

  /** Parses metadata from a file that stays in place on disk. */
  private async parseExternalFile(
    file: ScannedFile,
    fingerprint: string,
  ): Promise<Result<TrackToSave, ImportError>> {
    const fullSize = Math.min(file.size, MAX_METADATA_READ);

    let readResult = await this.readHead(file, initialHeadReadSize(file.ext, fullSize));
    if (readResult.isErr()) {
      return err(ImportError.readFailed(file.name, readResult.error));
    }
    let bytes = readResult.value;

    if (file.ext === "mp3" && bytes.length < fullSize && !mp3HasVbrHeader(bytes)) {
      readResult = await this.readHead(file, fullSize);
      if (readResult.isErr()) {
        return err(ImportError.readFailed(file.name, readResult.error));
      }
      bytes = readResult.value;
    }

    try {
      return ok(await this.parseHead(file, fingerprint, bytes));
    }
    catch (initialError) {
      if (bytes.length >= fullSize) {
        return err(ImportError.parseFailed(file.name, initialError));
      }
      readResult = await this.readHead(file, fullSize);
      if (readResult.isErr()) {
        return err(ImportError.readFailed(file.name, readResult.error));
      }
      try {
        return ok(await this.parseHead(file, fingerprint, readResult.value));
      }
      catch (e) {
        return err(ImportError.parseFailed(file.name, e));
      }
    }
  }

  private async readHead(file: ScannedFile, readSize: number) {
    const nativeStorage = storageService as IFileStorageWithNativeSupport;
    return nativeStorage.readBytes(file.absolutePath, readSize);
  }

  private async parseHead(file: ScannedFile, fingerprint: string, bytes: Uint8Array): Promise<TrackToSave> {
    const meta = await this.deps.metadataParser.parse(file.name, bytes);

    return {
      trackId: TrackId(crypto.randomUUID()),
      fileName: file.name,
      storagePath: file.absolutePath,
      fingerprint,
      source: TrackSource.LOCAL_EXTERNAL,
      meta,
    };
  }
}
