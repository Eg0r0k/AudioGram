import { db } from "@/db";
import type { RadioStationEntity } from "@/db/entities";
import type { RadioStationId } from "@/types/ids";
import type { Result } from "neverthrow";
import { ok, err } from "neverthrow";
import { BaseRepository } from "./base.repository";

class RadioStationRepository extends BaseRepository<RadioStationEntity, RadioStationId> {
  constructor() {
    super(db.radioStations);
  }

  async update(
    id: RadioStationId,
    changes: Partial<RadioStationEntity>,
  ): Promise<Result<number, Error>> {
    try {
      const withTimestamp: Partial<RadioStationEntity> = {
        ...changes,
        updatedAt: Date.now(),
      };
      const count = await this.table.update(id, withTimestamp);
      return ok(count);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findAllOrderedByDate(): Promise<Result<RadioStationEntity[], Error>> {
    try {
      const stations = await this.table
        .orderBy("addedAt")
        .reverse()
        .toArray();
      return ok(stations);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findFavorites(): Promise<Result<RadioStationEntity[], Error>> {
    try {
      const stations = await this.table
        .where("isFavorite")
        .equals(1)
        .toArray();
      return ok(stations);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async toggleFavorite(id: RadioStationId): Promise<Result<boolean, Error>> {
    try {
      const station = await this.table.get(id);
      if (!station) return err(new Error(`RadioStation not found: ${id}`));

      const next = !station.isFavorite;
      await this.table.update(id, {
        isFavorite: next,
        updatedAt: Date.now(),
      });

      return ok(next);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async markPlayed(id: RadioStationId): Promise<Result<void, Error>> {
    try {
      await this.table.update(id, {
        lastPlayedAt: Date.now(),
      });
      return ok(undefined);
    }
    catch (error) {
      return err(error as Error);
    }
  }

  async findRecentlyPlayed(limit = 10): Promise<Result<RadioStationEntity[], Error>> {
    try {
      const stations = await this.table
        .orderBy("lastPlayedAt")
        .reverse()
        .filter(s => s.lastPlayedAt !== undefined)
        .limit(limit)
        .toArray();
      return ok(stations);
    }
    catch (error) {
      return err(error as Error);
    }
  }
}

export const radioStationRepository = new RadioStationRepository();
