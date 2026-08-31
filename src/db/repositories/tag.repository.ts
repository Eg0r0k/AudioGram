import { db } from "@/db";
import type { TagEntity } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import { TagId } from "@/types/ids";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

class TagRepository extends BaseRepository<TagEntity, TagId> {
  constructor() {
    super(db.tags);
  }

  async findByTrackId(trackId: TrackId): Promise<Result<TagEntity[], Error>> {
    try {
      const track = await db.tracks.get(trackId);
      if (!track || track.tagIds.length === 0) {
        return ok([]);
      }
      const tags = await this.table.bulkGet(track.tagIds);
      return ok(tags.filter((tag): tag is TagEntity => tag !== undefined));
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findOrCreate(name: string): Promise<Result<TagEntity, Error>> {
    try {
      const normalizedName = name.trim().toLowerCase();
      // Lookup and insert in one transaction: `name` is a unique index, so
      // two concurrent calls for a new name would otherwise race into a
      // ConstraintError on the second add().
      const tag = await db.transaction("rw", db.tags, async () => {
        const existing = await this.table.where("name").equals(normalizedName).first();
        if (existing) return existing;
        const created: TagEntity = { id: TagId(crypto.randomUUID()), name: normalizedName };
        await this.table.add(created);
        return created;
      });
      return ok(tag);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const tagRepository = new TagRepository();
