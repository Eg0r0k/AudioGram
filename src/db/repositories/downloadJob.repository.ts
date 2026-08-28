import { Result, ok, err } from "neverthrow";
import { db } from "@/db";
import type { DownloadJobEntity, DownloadJobStatus } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

class DownloadJobRepository extends BaseRepository<DownloadJobEntity, string> {
  constructor() {
    super(db.downloadJobs);
  }

  async findByStatus(status: DownloadJobStatus): Promise<Result<DownloadJobEntity[], Error>> {
    try {
      const jobs = await db.downloadJobs.where("status").equals(status).sortBy("addedAt");
      return ok(jobs);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findByBatchId(batchId: string): Promise<Result<DownloadJobEntity[], Error>> {
    try {
      const jobs = await db.downloadJobs.where("batchId").equals(batchId).sortBy("addedAt");
      return ok(jobs);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  /** Queued or running job for a track — the enqueue dedupe check. */
  async findActiveByTrackId(trackId: TrackId): Promise<Result<DownloadJobEntity | undefined, Error>> {
    try {
      const job = await db.downloadJobs
        .where("status")
        .anyOf("queued", "running")
        .filter(candidate => candidate.trackId === trackId)
        .first();
      return ok(job);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  /** Drops terminal-error rows for a track — a fresh enqueue supersedes them. */
  async deleteErrorsByTrackId(trackId: TrackId): Promise<Result<number, Error>> {
    try {
      const deleted = await db.downloadJobs
        .where("status")
        .equals("error")
        .filter(job => job.trackId === trackId)
        .delete();
      return ok(deleted);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  /**
   * Atomically claims a queued job for running. False means another worker
   * (or a stale pump) got there first — the caller must skip the job.
   */
  async claim(id: string): Promise<Result<boolean, Error>> {
    try {
      const modified = await db.downloadJobs
        .where("id")
        .equals(id)
        .and(job => job.status === "queued")
        .modify({ status: "running" satisfies DownloadJobStatus });
      return ok(modified === 1);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  /** Startup recovery: jobs left running by a dead session queue up again. */
  async requeueRunning(): Promise<Result<number, Error>> {
    try {
      const modified = await db.downloadJobs
        .where("status")
        .equals("running")
        .modify({ status: "queued" satisfies DownloadJobStatus });
      return ok(modified);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const downloadJobRepository = new DownloadJobRepository();
