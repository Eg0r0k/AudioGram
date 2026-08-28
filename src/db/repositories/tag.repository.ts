import { db } from "@/db";
import type { TagEntity } from "@/db/entities";
import { TagId, TrackId } from "@/types/ids";
import { Result, ok, err } from "neverthrow";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

class TagRepository extends BaseRepository<TagEntity, TagId> {
  constructor() {
    super(db.tags);
  }

  async findByIds(ids: TagId[]): Promise<Result<TagEntity[], Error>> {
    try {
      if (ids.length === 0) {
        return ok([]);
      }
      const tags = await this.table.where("id").anyOf(ids).toArray();
      const map = new Map(tags.map(t => [t.id, t]));
      return ok(ids.flatMap(id => map.get(id) ? [map.get(id)!] : []));
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findByTrackId(trackId: TrackId): Promise<Result<TagEntity[], Error>> {
    try {
      const track = await db.tracks.get(trackId);
      if (!track || !track.tagIds || track.tagIds.length === 0) {
        return ok([]);
      }
      const tags = await this.table.where("id").anyOf(track.tagIds).toArray();
      const map = new Map(tags.map(t => [t.id, t]));
      return ok(track.tagIds.flatMap(id => map.get(id) ? [map.get(id)!] : []));
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findOrCreate(name: string): Promise<Result<TagEntity, Error>> {
    try {
      const normalizedName = name.trim().toLowerCase();
      const existing = await this.table.where("name").equals(normalizedName).first();
      if (existing) {
        return ok(existing);
      }
      const id = TagId(crypto.randomUUID());
      const tag: TagEntity = {
        id,
        name: normalizedName,
      };
      const addedId = await this.table.add(tag);
      return ok({ ...tag, id: addedId as TagId });
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const tagRepository = new TagRepository();
