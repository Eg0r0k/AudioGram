import { db } from "@/db";
import type { AudioFeaturesEntity } from "@/db/entities";
import { BaseRepository } from "./base.repository";
import type { TrackId } from "@/types/ids";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { toDbError } from "@/db/errors/db.errors";

export const CURRENT_ALGORITHM_VERSION = 1;

class AudioFeaturesRepository extends BaseRepository<AudioFeaturesEntity, TrackId> {
  constructor() {
    super(db.audioFeatures);
  }

  async findUnanalyzedIds(): Promise<Result<TrackId[], Error>> {
    try {
      const analyzed = await this.table
        .where("algorithmVersion")
        .aboveOrEqual(CURRENT_ALGORITHM_VERSION)
        .primaryKeys();

      const analyzedSet = new Set(analyzed);

      const allTrackIds = await db.tracks
        .toCollection()
        .primaryKeys();

      return ok(allTrackIds.filter(id => !analyzedSet.has(id)));
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async countAnalyzed(): Promise<Result<number, Error>> {
    try {
      const count = await this.table
        .where("algorithmVersion")
        .aboveOrEqual(CURRENT_ALGORITHM_VERSION)
        .count();
      return ok(count);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async findManyByIds(trackIds: TrackId[]): Promise<Result<AudioFeaturesEntity[], Error>> {
    try {
      if (trackIds.length === 0) return ok([]);
      const results = await this.table
        .where("trackId")
        .anyOf(trackIds)
        .toArray();
      return ok(results);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const audioFeaturesRepository = new AudioFeaturesRepository();
