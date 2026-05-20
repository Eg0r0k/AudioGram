import type { TrackEntity } from "@/db/entities";
import { getLogger } from "@/lib/logger";
import type { Track } from "@/modules/player/types";
import type { Result } from "neverthrow";

export async function unwrapResult<T>(
  promise: Promise<Result<T, Error>>,
): Promise<T> {
  const result = await promise;

  if (result.isErr()) {
    getLogger().error(`[DB] ${result.error.message}`);
    throw result.error;
  }

  return result.value;
}
export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function upsertById<T extends { id: string }>(
  items: readonly T[],
  item: T,
): T[] {
  const index = items.findIndex(candidate => candidate.id === item.id);

  if (index === -1) {
    return [...items, item];
  }

  const next = [...items];
  next[index] = item;
  return next;
}

export function removeById<T extends { id: string }>(
  items: readonly T[],
  id: string,
): T[] {
  return items.filter(item => item.id !== id);
}

export function patchTrackEntityLike(
  track: TrackEntity,
  likedAt: number | undefined,
): TrackEntity {
  return {
    ...track,
    likedAt,
  };
}

export function patchTrackLike(track: Track, isLiked: boolean): Track {
  return {
    ...track,
    isLiked,
  };
}
