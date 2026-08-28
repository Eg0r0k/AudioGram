import { db } from "@/db";
import type { TrackChapterEntity, TrackChapterMark } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import { err, ok, type Result } from "neverthrow";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

class TrackChaptersRepository extends BaseRepository<TrackChapterEntity, TrackId> {
  constructor() {
    super(db.trackChapters);
  }

  async setForTrack(trackId: TrackId, chapters: TrackChapterMark[]): Promise<Result<void, Error>> {
    try {
      if (!trackId) {
        return err(new Error("chapters require a library track id"));
      }
      if (chapters.length === 0) {
        await this.table.delete(trackId);
        return ok(undefined);
      }
      const clean: TrackChapterMark[] = chapters.map(c => ({
        time: c.time,
        ...(c.title !== undefined ? { title: c.title } : {}),
      }));
      await this.table.put({ trackId, chapters: clean, updatedAt: Date.now() });
      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const trackChaptersRepository = new TrackChaptersRepository();
