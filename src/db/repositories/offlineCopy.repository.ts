import { db } from "@/db";
import type { OfflineCopyEntity } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import { BaseRepository } from "./base.repository";

class OfflineCopyRepository extends BaseRepository<OfflineCopyEntity, TrackId> {
  constructor() {
    super(db.offlineCopies);
  }
}

export const offlineCopyRepository = new OfflineCopyRepository();
