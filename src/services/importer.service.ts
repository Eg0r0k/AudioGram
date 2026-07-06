import pLimit from "p-limit";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { storageService } from "@/db/storage";
import {
  hasNativeSupport,
  IFileStorageWithNativeSupport,
} from "@/db/storage/IFileStorage";
import { TimeProfiler } from "@/lib/profiler";
import { WorkerPool } from "./worker-pool";
import { ImportBatchResult, ImportControl, ImportError, ImportErrorCode, ImportItem, ImportSuccess, TrackToSave } from "./types";
import { EntityResolver } from "./entity-resolver";
import { ok, err, Result, ResultAsync } from "neverthrow";
import { isValidImportItem } from "@/lib/environment/mimeSupport";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { normalizeMetadata } from "@/lib/metadata";
import { ScannedFile, SyncResult, WatchedFolder } from "@/modules/watched-folders/types";
import { StorageError } from "@/db/errors/storage.errors";
import { computeFileFingerprint, computeFileFingerprintFromBlob } from "@/modules/watched-folders/services/file-fingerprint";
import { AlbumEntity, ArtistEntity, TrackEntity, TrackSource, TrackState } from "@/db/entities";
import { unitOfWork } from "@/db/unit-of-work";
import { albumRepository, artistRepository, coverRepository, trackRepository } from "@/db/repositories";
import { scanFolder } from "@/modules/watched-folders/services/folder-scanner";
import { unwrapResult } from "@/queries/shared";

// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════

const HEAD_READ_SIZE = 10 * 1024 * 1024;
const MAX_METADATA_READ = 12 * 1024 * 1024;
const PROCESS_CONCURRENCY = 16;
const DB_BATCH_SIZE = 50;
const PIPELINE_BATCH_SIZE = 100;
const FINGERPRINT_CONCURRENCY = 16;
const AUDIO_FILE_EXTENSIONS = ["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma", "alac"];

export interface ImportFilePickerOptions {
  title: string;
  filterName?: string;
  extensions?: string[];
}

export class MusicLibraryEngine {
  private readonly workerPool = new WorkerPool();
  private readonly processLimit = pLimit(PROCESS_CONCURRENCY);
  private readonly fpLimit = pLimit(FINGERPRINT_CONCURRENCY);
  private readonly profiler = new TimeProfiler();

  private _onTracksImported?: (ids: TrackId[]) => void;

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
      filters: [{ name: options.filterName ?? "Audio", extensions: options.extensions ?? AUDIO_FILE_EXTENSIONS }],
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

    const items: ImportItem[] = paths.map(path => ({
      type: "native" as const,
      name: path.split(/[\\/]/).pop() ?? "unknown",
      ext: path.split(".").pop()?.toLowerCase() ?? "",
      path,
      fileSize: 0,
    }));

    return this.runPipeline(items, onProgress, control);
  }

  async importFiles(
    files: File[],
    onProgress?: (current: number, total: number) => void,
    control?: ImportControl,
  ): Promise<ImportBatchResult> {
    const items: ImportItem[] = files.map(file => ({
      type: "web" as const,
      name: file.name,
      ext: file.name.split(".").pop()?.toLowerCase() ?? "",
      file,
      fileSize: file.size,
    }));

    return this.runPipeline(items, onProgress, control);
  }

  async syncFolder(
    folder: WatchedFolder,
    onProgress?: (current: number, total: number) => void,
    excludedPaths?: string[],
  ): Promise<SyncResult> {
    const result: SyncResult = { folderId: folder.id, added: 0, removed: 0, failed: 0, errors: [] };
    if (!hasNativeSupport(storageService)) return result;

    const nativeStorage = storageService as IFileStorageWithNativeSupport;
    const excludeSet = new Set(excludedPaths ?? []);

    const scanned = await scanFolder(folder.path, undefined, excludeSet);
    const scannedPaths = new Set(scanned.map(f => f.absolutePath));

    let existingTracks = await unwrapResult(trackRepository.findByStoragePathPrefix(folder.path + "/"));
    if (excludedPaths?.length) {
      existingTracks = existingTracks.filter(
        t => !excludedPaths.some(ep => t.storagePath.startsWith(ep + "/")),
      );
    }

    const existingPaths = new Set(existingTracks.map(t => t.storagePath));
    const newFiles = scanned.filter(f => !existingPaths.has(f.absolutePath));
    const removedTracks = existingTracks.filter(t => !scannedPaths.has(t.storagePath));

    const totalWork = newFiles.length + removedTracks.length;
    let processed = 0;
    onProgress?.(0, totalWork);

    // Own fingerprint registry — not shared with any concurrent import
    const knownFingerprints = await this.loadKnownFingerprints();
    const filesToImport: Array<{ file: ScannedFile; fingerprint: string }> = [];

    for (const file of newFiles) {
      try {
        const fp = await computeFileFingerprint(file.absolutePath, file.size);
        if (!knownFingerprints.has(fp)) {
          knownFingerprints.add(fp);
          filesToImport.push({ file, fingerprint: fp });
        }
      }
      catch {
        result.failed++;
      }
      processed++;
      onProgress?.(processed, totalWork);
    }

    const allParsed: TrackToSave[] = [];
    const parseResults = await Promise.all(
      filesToImport.map(({ file, fingerprint }) =>
        this.processLimit(() => this.parseExternalFile(file, fingerprint, nativeStorage)),
      ),
    );
    for (const r of parseResults) {
      if (r.isOk()) {
        allParsed.push(r.value);
      }
      else {
        result.failed++;
      }
    }

    if (allParsed.length > 0) {
      // Own EntityResolver — no shared state with concurrent imports
      const resolver = new EntityResolver();
      await resolver.resolve(allParsed.map(p => p.meta));

      for (let i = 0; i < allParsed.length; i += DB_BATCH_SIZE) {
        const batch = allParsed.slice(i, i + DB_BATCH_SIZE);
        try {
          const saved = await this.persistBatch(batch, resolver);
          result.added += saved.length;
        }
        catch (e) {
          result.failed += batch.length;
          result.errors.push({ path: folder.path, message: `DB batch failed: ${String(e)}` });
        }
        processed += batch.length;
        onProgress?.(processed, totalWork);
      }
    }

    if (removedTracks.length > 0) {
      await trackRepository.deleteMany(removedTracks.map(t => t.id));
      result.removed = removedTracks.length;
      processed += removedTracks.length;
      onProgress?.(processed, totalWork);
    }

    return result;
  }

  async importSingleExternalFile(file: ScannedFile): Promise<boolean> {
    if (!hasNativeSupport(storageService)) return false;
    const nativeStorage = storageService as IFileStorageWithNativeSupport;

    const fp = await computeFileFingerprint(file.absolutePath, file.size);
    const [existsByPath, existsByFp] = await Promise.all([
      unwrapResult(trackRepository.findByStoragePath(file.absolutePath)),
      unwrapResult(trackRepository.existsByFingerprint(fp)),
    ]);
    if (existsByPath || existsByFp) return false;

    const trackToSaveResult = await this.parseExternalFile(file, fp, nativeStorage);
    if (trackToSaveResult.isErr()) return false;
    const trackToSave = trackToSaveResult.value;

    try {
      const resolver = new EntityResolver();
      await resolver.resolve([trackToSave.meta]);
      await this.persistBatch([trackToSave], resolver);
      return true;
    }
    catch {
      return false;
    }
  }

  async removeSingleFile(absolutePath: string): Promise<boolean> {
    const track = await unwrapResult(trackRepository.findByStoragePath(absolutePath));
    if (!track) return false;
    await trackRepository.delete(track.id);
    return true;
  }

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

  dispose(): void {
    this.workerPool.dispose();
  }

  /**
   * Pipeline
   */
  private async runPipeline(
    items: ImportItem[],
    onProgress: ((c: number, t: number) => void) | undefined,
    control?: ImportControl,
  ): Promise<ImportBatchResult> {
    this.profiler.reset();

    const total = items.length;
    let processed = 0;
    let skipped = 0;
    let cancelled = false;
    const successful: ImportSuccess[] = [];
    const failed: Array<{ fileName: string; error: ImportError }> = [];

    onProgress?.(0, total);

    if (await this.isCancelled(control)) {
      return { successful, failed, skipped, total, cancelled: true };
    }

    const knownFingerprints = await this.loadKnownFingerprints();

    const batches: ImportItem[][] = [];
    for (let i = 0; i < items.length; i += PIPELINE_BATCH_SIZE) {
      batches.push(items.slice(i, i + PIPELINE_BATCH_SIZE));
    }

    for (const batch of batches) {
      if (await this.isCancelled(control)) {
        cancelled = true;
        break;
      }

      const batchResult = await this.processBatch(batch, knownFingerprints, control);

      skipped += batchResult.skipped;
      failed.push(...batchResult.failed);
      processed += batchResult.processed;
      cancelled ||= batchResult.cancelled;
      onProgress?.(processed, total);

      if (cancelled) break;
      if (batchResult.tracksToSave.length === 0) continue;

      if (await this.isCancelled(control)) {
        cancelled = true;
        break;
      }

      // Own resolver per batch — safe from concurrent runs
      const resolver = new EntityResolver();
      await resolver.resolve(batchResult.tracksToSave.map(t => t.meta));

      for (let i = 0; i < batchResult.tracksToSave.length; i += DB_BATCH_SIZE) {
        if (await this.isCancelled(control)) {
          cancelled = true;
          break;
        }

        const dbBatch = batchResult.tracksToSave.slice(i, i + DB_BATCH_SIZE);
        const dbResult = await ResultAsync.fromPromise(
          this.persistBatch(dbBatch, resolver),
          e => ImportError.databaseFailed("batch", e),
        );

        dbResult.match(
          (saved) => {
            successful.push(...saved);
            if (saved.length > 0) {
              this._onTracksImported?.(saved.map(s => s.trackId));
            }
          },
          error => dbBatch.forEach(item => failed.push({ fileName: item.fileName, error })),
        );

        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    this.profiler.printReport("Import");

    return {
      successful,
      failed,
      skipped,
      total,
      ...(cancelled ? { cancelled: true } : {}),
      timings: this.profiler.getTimings(),
    };
  }

  private async processBatch(
    items: ImportItem[],
    knownFingerprints: Set<string>,
    control?: ImportControl,
  ): Promise<{
    tracksToSave: TrackToSave[];
    failed: Array<{ fileName: string; error: ImportError }>;
    skipped: number;
    processed: number;
    cancelled: boolean;
  }> {
    const tracksToSave: TrackToSave[] = [];
    const failed: Array<{ fileName: string; error: ImportError }> = [];
    let skipped = 0;
    let processed = 0;
    let cancelled = false;

    const validated: ImportItem[] = [];
    for (const item of items) {
      if (!isValidImportItem(item.name, item.file?.type)) {
        failed.push({ fileName: item.name, error: ImportError.unsupportedFormat(item.name, item.ext) });
        processed++;
      }
      else {
        validated.push(item);
      }
    }

    if (validated.length === 0) return { tracksToSave, failed, skipped, processed, cancelled };

    const fpResults = await Promise.all(
      validated.map(item =>
        this.fpLimit(() => this.computeFingerprint(item).then(fp => ({ item, fp }))),
      ),
    );

    const toProcess: ImportItem[] = [];
    const seenInBatch = new Map<string, ImportItem>();
    const seenPaths = new Set<string>();

    for (const { item, fp } of fpResults) {
      if (item.path) {
        if (seenPaths.has(item.path)) {
          skipped++;
          processed++;
          continue;
        }
        seenPaths.add(item.path);
      }

      if (fp !== null) {
        if (knownFingerprints.has(fp)) {
          skipped++;
          processed++;
          continue;
        }
        if (seenInBatch.has(fp)) {
          skipped++;
          processed++;
          continue;
        }

        knownFingerprints.add(fp);
        seenInBatch.set(fp, item);
        item.fingerprint = fp;
      }
      toProcess.push(item);
    }

    if (toProcess.length === 0) return { tracksToSave, failed, skipped, processed, cancelled };

    const processResults = await Promise.all(
      toProcess.map(item =>
        this.processLimit(async () => {
          if (await this.isCancelled(control)) return { type: "cancelled" as const };
          return { type: "result" as const, result: await this.processItem(item, control) };
        }),
      ),
    );

    for (const r of processResults) {
      if (r.type === "cancelled") {
        cancelled = true;
        continue;
      }

      r.result.match(
        data => tracksToSave.push(data),
        (error) => {
          if (error.code === ImportErrorCode.CANCELLED) {
            cancelled = true;
            return;
          }

          failed.push({ fileName: error.fileName ?? "unknown", error });
        },
      );
      processed++;
    }

    return { tracksToSave, failed, skipped, processed, cancelled };
  }

  private processItem(
    item: ImportItem,
    control?: ImportControl,
  ): ResultAsync<TrackToSave, ImportError> {
    const trackId = TrackId(crypto.randomUUID());
    const storagePath = `tracks/${trackId}.${item.ext}`;

    return ResultAsync.fromPromise(
      this.readItemBytes(item),
      (e): ImportError => e instanceof ImportError ? e : ImportError.readFailed(item.name, e),
    )
      .andThen(data =>
        ResultAsync.fromPromise(
          this.workerPool.parse(item.name, data, { extractCover: true }),
          (e): ImportError => e instanceof ImportError ? e : ImportError.parseFailed(item.name, e),
        ),
      )
      .andThen((rawMeta) => {
        const fileMock = item.file ?? ({ name: item.name, webkitRelativePath: "" } as File);
        const meta = normalizeMetadata(fileMock, rawMeta);

        return ResultAsync.fromPromise(
          (async () => {
            if (await this.isCancelled(control)) {
              throw ImportError.cancelled(item.name);
            }
            await this.copyItem(item, storagePath);
            return { trackId, fileName: item.name, storagePath, fingerprint: item.fingerprint ?? "", source: TrackSource.LOCAL_INTERNAL, meta };
          })(),
          (e): ImportError => e instanceof ImportError ? e : ImportError.storageFailed(item.name, e),
        );
      });
  }

  private async parseExternalFile(
    file: ScannedFile,
    fingerprint: string,
    nativeStorage: IFileStorageWithNativeSupport,
  ): Promise<Result<TrackToSave, ImportError>> {
    const readSize = Math.min(file.size, MAX_METADATA_READ);

    const readResult = await nativeStorage.readBytes(file.absolutePath, readSize);
    if (readResult.isErr()) {
      return err(ImportError.readFailed(file.name, readResult.error));
    }

    try {
      const rawMeta = await this.workerPool.parse(file.name, readResult.value, { extractCover: true });
      const fileMock = { name: file.name, webkitRelativePath: "" } as File;
      const meta = normalizeMetadata(fileMock, rawMeta);

      return ok({
        trackId: TrackId(crypto.randomUUID()),
        fileName: file.name,
        storagePath: file.absolutePath,
        fingerprint,
        source: TrackSource.LOCAL_EXTERNAL,
        meta,
      });
    }
    catch (e) {
      return err(ImportError.parseFailed(file.name, e));
    }
  }

  private async persistBatch(
    items: TrackToSave[],
    resolver: EntityResolver,
  ): Promise<ImportSuccess[]> {
    const now = Date.now();

    const artistsToCreate = new Map<ArtistId, ArtistEntity>();
    const albumsToCreate = new Map<AlbumId, AlbumEntity>();
    const coversToCreate: Array<{ ownerId: AlbumId; blob: Blob; mimeType: string }> = [];
    const tracksToCreate: TrackEntity[] = [];
    const results: ImportSuccess[] = [];

    const allArtistIds = [...new Set(items.flatMap(item => resolver.getArtistIds(item.meta)))];
    const allAlbumIds = [...new Set(
      items.map((item) => {
        const firstId = resolver.getArtistIds(item.meta)[0];
        if (!firstId || !item.meta.album) return null;
        return resolver.getAlbumEntry(firstId, item.meta.album)?.id ?? null;
      }).filter((id): id is AlbumId => id !== null),
    )];

    const [artistResults, albumResults] = await Promise.all([
      allArtistIds.length > 0
        ? unwrapResult(artistRepository.findByIds(allArtistIds))
        : Promise.resolve([] as ArtistEntity[]),
      allAlbumIds.length > 0
        ? unwrapResult(albumRepository.findByIds(allAlbumIds))
        : Promise.resolve([] as AlbumEntity[]),
    ]);

    const existingArtistIdSet = new Set(artistResults.map(a => a.id));
    const existingAlbumIdSet = new Set(albumResults.map(a => a.id));

    for (const item of items) {
      const artistIds = resolver.getArtistIds(item.meta);
      const firstArtistId = artistIds[0] ?? null;

      const hasAlbum = !!item.meta.album?.trim() && item.meta.album !== "Unknown Album";
      let albumId: AlbumId = AlbumId("");

      if (hasAlbum && firstArtistId) {
        const entry = resolver.getAlbumEntry(firstArtistId, item.meta.album);
        if (entry) {
          albumId = entry.id;

          if (entry.isNew && !existingAlbumIdSet.has(entry.id) && !albumsToCreate.has(entry.id)) {
            albumsToCreate.set(entry.id, {
              id: entry.id,
              title: item.meta.album,
              artistId: firstArtistId,
              year: item.meta.year,
              addedAt: now,
              updatedAt: now,
            });

            if (item.meta.pictureBlob) {
              coversToCreate.push({
                ownerId: entry.id,
                blob: item.meta.pictureBlob,
                mimeType: item.meta.pictureBlob.type || "image/jpeg",
              });
            }
          }
        }
      }

      for (const artistId of artistIds) {
        if (!existingArtistIdSet.has(artistId) && !artistsToCreate.has(artistId)) {
          const name = item.meta.artists.find(a => resolver.getArtistId(a) === artistId);
          if (name) {
            artistsToCreate.set(artistId, { id: artistId, name, addedAt: now, updatedAt: now });
          }
        }
      }

      tracksToCreate.push({
        id: item.trackId,
        title: item.meta.title,
        artistName: item.meta.artists.join(", "),
        albumTitle: item.meta.album || "",
        artistIds,
        albumId,
        tagIds: [],
        source: item.source,
        state: TrackState.READY,
        storagePath: item.storagePath,
        duration: item.meta.duration,
        format: item.meta.format,
        trackNo: item.meta.trackNo,
        diskNo: item.meta.diskNo,
        playCount: 0,
        addedAt: now,
        fingerprint: item.fingerprint,
        integratedLufs: item.meta.integratedLufs,
        truePeakDbtp: item.meta.truePeakDbtp,
        replayGainDb: item.meta.replayGainDb,
        replayPeak: item.meta.replayPeak,
      });

      results.push({
        trackId: item.trackId,
        fileName: item.fileName,
        title: item.meta.title,
        artist: item.meta.artists.join(", "),
        album: item.meta.album,
      });
    }

    const uowResult = await unitOfWork.run(async () => {
      if (artistsToCreate.size > 0) {
        await artistRepository.createMany([...artistsToCreate.values()]);
      }
      if (albumsToCreate.size > 0) {
        await albumRepository.createMany([...albumsToCreate.values()]);
      }
      if (coversToCreate.length > 0) {
        await coverRepository.createMany(
          coversToCreate.map(c => ({
            id: crypto.randomUUID(),
            ownerType: "album" as const,
            ownerId: c.ownerId,
            blob: c.blob,
            mimeType: c.mimeType,
            addedAt: now,
            updatedAt: now,
          })),
        );
      }
      if (tracksToCreate.length > 0) {
        await trackRepository.createMany(tracksToCreate);
      }
    });

    if (uowResult.isErr()) throw uowResult.error;

    return results;
  }

  private async loadKnownFingerprints(): Promise<Set<string>> {
    return unwrapResult(trackRepository.getAllFingerprints());
  }

  private async computeFingerprint(item: ImportItem): Promise<string | null> {
    try {
      if (item.type === "native" && item.path && hasNativeSupport(storageService)) {
        if (item.fileSize <= 0) {
          try {
            item.fileSize = (await stat(item.path)).size;
          }
          catch { /* ok */ }
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

  private async readItemBytes(item: ImportItem): Promise<Uint8Array> {
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

  private async copyItem(item: ImportItem, targetPath: string): Promise<void> {
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

  private async isCancelled(control?: ImportControl): Promise<boolean> {
    await control?.waitIfPaused?.();
    return control?.isCancelled?.() ?? false;
  }

  private emptyFailResult(paths: string[], message: string): ImportBatchResult {
    return {
      successful: [],
      failed: paths.map(p => ({
        fileName: p.split(/[\\/]/).pop() ?? "unknown",
        error: new ImportError(ImportErrorCode.NATIVE_IMPORT_UNAVAILABLE, message),
      })),
      skipped: 0,
      total: paths.length,
    };
  }
}

export const musicLibraryEngine = new MusicLibraryEngine();
