import type { CoverOwnerType } from "@/db/entities";
import { coverRepository } from "@/db/repositories";
import { unwrapResult } from "./shared";

/**
 * The covers of `ownerIds` (one owner type) as one index read; owners without
 * a cover are absent. The only read path into Dexie covers — consumers go
 * through the cover cache (modules/covers/lib/cover-cache.ts), which batches
 * and holds the results.
 */
export async function getCoverBlobsByOwners(
  ownerType: CoverOwnerType,
  ownerIds: readonly string[],
): Promise<Map<string, Blob>> {
  const covers = await unwrapResult(coverRepository.findByOwners(ownerType, ownerIds));
  return new Map(covers.map(cover => [cover.ownerId, cover.blob]));
}
