import pLimit from "p-limit";
import { ResultAsync } from "neverthrow";
import { isValidImportItem } from "@/lib/environment/mimeSupport";
import { getLogger } from "@/lib/logger";
import { TrackId } from "@/types/ids";
import { trackRepository } from "@/db/repositories";
import { TrackSource } from "@/db/entities";
import { unwrapResult } from "@/lib/result";
import { EntityResolver } from "../entity-resolver";
import {
  ImportBatchResult,
  ImportControl,
  ImportError,
  ImportErrorCode,
  ImportItem,
  ImportSuccess,
  TrackToSave,
} from "../types";
import {
  DB_BATCH_SIZE,
  FINGERPRINT_CONCURRENCY,
  PIPELINE_BATCH_SIZE,
  PROCESS_CONCURRENCY,
} from "./constants";
import { ImportItemIO } from "./item-io";
import { MetadataParser } from "./metadata-parser";
import { persistTracks } from "./track-persister";
import { isCancelled, yieldToEventLoop } from "./shared";
import { chunk } from "@/lib/math";
import { sniffAudioExtension } from "@/lib/files/sniffAudioType";

type FailedImport = { fileName: string; error: ImportError };

interface BatchOutcome {
  tracksToSave: TrackToSave[];
  failed: FailedImport[];
  skipped: number;
  processed: number;
  cancelled: boolean;
}

export interface ImportPipelineDeps {
  itemIO: ImportItemIO;
  metadataParser: MetadataParser;
  /** Notified after every successfully persisted DB batch. */
  onTracksImported?: (ids: TrackId[]) => void;
}

/**
 * Orchestrates a full import run:
 * validate → fingerprint & dedupe → parse & copy → persist in DB batches.
 * Supports cooperative pause/cancel via {@link ImportControl}.
 */
export class ImportPipeline {
  private readonly processLimit = pLimit(PROCESS_CONCURRENCY);
  private readonly fpLimit = pLimit(FINGERPRINT_CONCURRENCY);

  constructor(private readonly deps: ImportPipelineDeps) {}

  async run(
    items: ImportItem[],
    onProgress?: (current: number, total: number) => void,
    control?: ImportControl,
  ): Promise<ImportBatchResult> {
    const total = items.length;
    let processed = 0;
    let skipped = 0;
    let cancelled = false;
    const successful: ImportSuccess[] = [];
    const failed: FailedImport[] = [];

    onProgress?.(0, total);

    if (await isCancelled(control)) {
      return { successful, failed, skipped, total, cancelled: true };
    }

    // Shared across batches so a duplicate in batch N is caught by batch 1's import.
    const knownFingerprints = await unwrapResult(trackRepository.getAllFingerprints());

    for (const batch of chunk(items, PIPELINE_BATCH_SIZE)) {
      if (await isCancelled(control)) {
        cancelled = true;
        break;
      }

      const outcome = await this.processBatch(batch, knownFingerprints, control);

      skipped += outcome.skipped;
      failed.push(...outcome.failed);
      processed += outcome.processed;
      cancelled ||= outcome.cancelled;
      onProgress?.(processed, total);

      if (cancelled) break;
      if (outcome.tracksToSave.length === 0) continue;

      if (await isCancelled(control)) {
        cancelled = true;
        break;
      }

      cancelled = await this.persistOutcome(outcome.tracksToSave, successful, failed, control);
      if (cancelled) break;
    }

    if (total > 0) {
      getLogger().info(
        `[Import] ${successful.length}/${total} imported, ${skipped} skipped, ${failed.length} failed${cancelled ? " (cancelled)" : ""}`,
      );
    }
    for (const f of failed) {
      getLogger().warn(`[Import] ${f.fileName}: ${f.error.message}`);
    }

    return {
      successful,
      failed,
      skipped,
      total,
      ...(cancelled ? { cancelled: true } : {}),
    };
  }

  /** Persists parsed tracks in DB-sized chunks. Returns whether the run was cancelled mid-way. */
  private async persistOutcome(
    tracksToSave: TrackToSave[],
    successful: ImportSuccess[],
    failed: FailedImport[],
    control?: ImportControl,
  ): Promise<boolean> {
    // Own resolver per batch — safe from concurrent runs.
    const resolver = new EntityResolver();
    await resolver.resolve(tracksToSave.map(t => t.meta));

    for (const dbBatch of chunk(tracksToSave, DB_BATCH_SIZE)) {
      if (await isCancelled(control)) return true;

      const dbResult = await ResultAsync.fromPromise(
        persistTracks(dbBatch, resolver),
        e => ImportError.databaseFailed("batch", e),
      );

      dbResult.match(
        (saved) => {
          successful.push(...saved);
          if (saved.length > 0) {
            this.deps.onTracksImported?.(saved.map(s => s.trackId));
          }
        },
        (error) => {
          getLogger().error(`[Import] DB batch of ${dbBatch.length} tracks failed: ${error.message}`);
          dbBatch.forEach(item => failed.push({ fileName: item.fileName, error }));
        },
      );

      // Yield to the event loop so UI progress updates stay responsive.
      await yieldToEventLoop();
    }

    return false;
  }

  private async processBatch(
    items: ImportItem[],
    knownFingerprints: Set<string>,
    control?: ImportControl,
  ): Promise<BatchOutcome> {
    const outcome: BatchOutcome = {
      tracksToSave: [],
      failed: [],
      skipped: 0,
      processed: 0,
      cancelled: false,
    };

    const validated = this.validateItems(items, outcome);
    if (validated.length === 0) return outcome;

    const toProcess = await this.dedupeItems(validated, knownFingerprints, outcome);
    if (toProcess.length === 0) return outcome;

    const processResults = await Promise.all(
      toProcess.map(item =>
        this.processLimit(async () => {
          if (await isCancelled(control)) return { type: "cancelled" as const };
          return { type: "result" as const, result: await this.processItem(item, control) };
        }),
      ),
    );

    for (const r of processResults) {
      if (r.type === "cancelled") {
        outcome.cancelled = true;
        continue;
      }

      r.result.match(
        data => outcome.tracksToSave.push(data),
        (error) => {
          if (error.code === ImportErrorCode.CANCELLED) {
            outcome.cancelled = true;
            return;
          }
          outcome.failed.push({ fileName: error.fileName ?? "unknown", error });
        },
      );
      outcome.processed++;
    }

    return outcome;
  }

  /** Filters out unsupported formats, recording them as failures. */
  private validateItems(items: ImportItem[], outcome: BatchOutcome): ImportItem[] {
    const validated: ImportItem[] = [];
    for (const item of items) {
      // Android MediaStore URIs expose no file name or extension; their
      // container is sniffed from the actual bytes later, which is a stricter
      // check than the name-based one.
      const isOpaqueContentUri
        = item.type === "native" && !item.ext && !!item.path?.startsWith("content://");
      if (isOpaqueContentUri || isValidImportItem(item.name, item.file?.type)) {
        validated.push(item);
      }
      else {
        outcome.failed.push({
          fileName: item.name,
          error: ImportError.unsupportedFormat(item.name, item.ext),
        });
        outcome.processed++;
      }
    }
    return validated;
  }

  /**
   * Drops duplicates by path (within the batch) and by fingerprint (against the
   * library and the batch itself). Successfully fingerprinted items are marked
   * as known immediately so later batches skip them too.
   */
  private async dedupeItems(
    items: ImportItem[],
    knownFingerprints: Set<string>,
    outcome: BatchOutcome,
  ): Promise<ImportItem[]> {
    const fpResults = await Promise.all(
      items.map(item =>
        this.fpLimit(() => this.deps.itemIO.computeFingerprint(item).then(fp => ({ item, fp }))),
      ),
    );

    const toProcess: ImportItem[] = [];
    const seenInBatch = new Set<string>();
    const seenPaths = new Set<string>();

    const skip = () => {
      outcome.skipped++;
      outcome.processed++;
    };

    for (const { item, fp } of fpResults) {
      if (item.path) {
        if (seenPaths.has(item.path)) {
          skip();
          continue;
        }
        seenPaths.add(item.path);
      }

      if (fp !== null) {
        if (knownFingerprints.has(fp) || seenInBatch.has(fp)) {
          skip();
          continue;
        }
        knownFingerprints.add(fp);
        seenInBatch.add(fp);
        item.fingerprint = fp;
      }
      toProcess.push(item);
    }

    return toProcess;
  }

  /** Reads, parses and copies a single item into managed storage. */
  private processItem(
    item: ImportItem,
    control?: ImportControl,
  ): ResultAsync<TrackToSave, ImportError> {
    const trackId = TrackId(crypto.randomUUID());
    // Resolved after the head bytes are read: Android content:// items carry
    // no extension, so it may have to be sniffed from the container magic.
    let storagePath = "";

    return ResultAsync.fromPromise(
      this.deps.itemIO.readHeadBytes(item),
      (e): ImportError => e instanceof ImportError ? e : ImportError.readFailed(item.name, e),
    )
      .andThen((data) => {
        const ext = item.ext || sniffAudioExtension(data) || "mp3";
        storagePath = `tracks/${trackId}.${ext}`;
        return ResultAsync.fromPromise(
          this.deps.metadataParser.parse(item.name, data, item.file),
          (e): ImportError => e instanceof ImportError ? e : ImportError.parseFailed(item.name, e),
        );
      })
      .andThen(meta =>
        ResultAsync.fromPromise(
          (async () => {
            if (await isCancelled(control)) {
              throw ImportError.cancelled(item.name);
            }
            await this.deps.itemIO.copyToStorage(item, storagePath);
            return {
              trackId,
              fileName: item.name,
              storagePath,
              fingerprint: item.fingerprint ?? "",
              source: TrackSource.LOCAL_INTERNAL,
              meta,
            };
          })(),
          (e): ImportError => e instanceof ImportError ? e : ImportError.storageFailed(item.name, e),
        ),
      );
  }
}
