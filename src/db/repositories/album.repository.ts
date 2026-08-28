import { db } from "@/db";
import type { AlbumEntity } from "@/db/entities";
import type { AlbumId, ArtistId } from "@/types/ids";
import type { UpdateSpec } from "dexie";
import { Result, ok, err } from "neverthrow";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

class AlbumRepository extends BaseRepository<AlbumEntity, AlbumId> {
  constructor() {
    super(db.albums);
  }

  async update(id: AlbumId, changes: Partial<AlbumEntity>): Promise<Result<number, Error>> {
    try {
      const withTimestamp: Partial<AlbumEntity> = {
        ...changes,
        updatedAt: Date.now(),
      };
      const count = await this.table.update(id, withTimestamp as UpdateSpec<AlbumEntity>);
      return ok(count);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  /** Library members only; shadow rows (pinned = 0) come from remote browsing. */
  async findPinned(): Promise<Result<AlbumEntity[], Error>> {
    try {
      const albums = await this.table.where("pinned").equals(1).toArray();
      return ok(albums);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findByArtistId(artistId: ArtistId): Promise<Result<AlbumEntity[], Error>> {
    try {
      const albums = await this.table
        .where("artistId")
        .equals(artistId)
        .sortBy("year");
      return ok(albums.reverse());
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findAllSortedByTitle(desc = false): Promise<Result<AlbumEntity[], Error>> {
    try {
      const collection = desc
        ? this.table.orderBy("title").reverse()
        : this.table.orderBy("title");
      const albums = await collection.toArray();
      return ok(albums);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async search(query: string, limit = 20): Promise<Result<AlbumEntity[], Error>> {
    try {
      const normalizedQuery = query.toLowerCase();
      const albums = await this.table
        .filter(album => album.title.toLowerCase().includes(normalizedQuery))
        .limit(limit)
        .toArray();
      return ok(albums);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  // Artist-page listing: shadow albums can reference a local artist via
  // substitution — skip them.
  async countByArtistId(artistId: ArtistId): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("[artistId+pinned]")
        .equals([artistId, 1])
        .count();
      return ok(count);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findByArtistIdPaginated(
    artistId: ArtistId,
    offset: number,
    limit: number,
  ): Promise<Result<AlbumEntity[], Error>> {
    try {
      // `year` is optional, so a compound [artistId+year] index would miss
      // undated albums; sort in memory instead (an artist has few albums).
      const all = await this.table
        .where("[artistId+pinned]")
        .equals([artistId, 1])
        .sortBy("year");
      all.reverse();
      return ok(all.slice(offset, offset + limit));
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const albumRepository = new AlbumRepository();
