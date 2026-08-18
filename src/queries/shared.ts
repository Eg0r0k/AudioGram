import type { TrackEntity } from "@/db/entities";
import { getLogger } from "@/lib/logger";
import type { Track } from "@/modules/player/types";
import type { SourceError, SourceErrorKind } from "@/types/source-dto";
import type { TrackSortKey } from "@/types/track-sort";
import type { Result } from "neverthrow";

export { unwrapResult } from "@/lib/result";

/** Typed SourceError carried across the TanStack Query boundary. */
export class SourceQueryError extends Error {
  constructor(public readonly kind: SourceErrorKind, message: string) {
    super(message);
    this.name = "SourceQueryError";
  }
}

/** unwrapResult's counterpart for the source-provider boundary. */
export async function unwrapSourceResult<T>(
  promise: PromiseLike<Result<T, SourceError>>,
): Promise<T> {
  const result = await promise;

  if (result.isErr()) {
    getLogger().error(`[Source] ${result.error.kind}: ${result.error.message}`);
    throw new SourceQueryError(result.error.kind, result.error.message);
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

export function sortTracks(tracks: TrackEntity[], sortKey: TrackSortKey): TrackEntity[] {
  const isDesc = sortKey.endsWith("_desc");
  const getSortValue = (t: TrackEntity) => {
    switch (sortKey) {
      case "title_asc": case "title_desc": return t.title || "";
      case "duration_asc": case "duration_desc": return t.duration || 0;
      case "plays_desc": return t.playCount || 0;
      case "artist_asc": return t.artistName || "";
      case "album_asc": case "album_desc": return t.albumTitle || "";
      default: return t.addedAt || 0;
    }
  };

  return [...tracks].sort((a, b) => {
    const valA = getSortValue(a);
    const valB = getSortValue(b);
    if (valA < valB) return isDesc ? 1 : -1;
    if (valA > valB) return isDesc ? -1 : 1;
    return 0;
  });
}
