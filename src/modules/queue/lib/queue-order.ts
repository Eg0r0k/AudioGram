import { clamp } from "@/lib/math";
import { fisherYatesShuffle } from "@/lib/shuffle";

export interface PlaybackQueue<T> {
  items: T[];
  playbackIndex: number;
}

export function clampQueueIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return clamp(index, 0, length - 1);
}

export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= list.length) return [...list];
  if (toIndex < 0 || toIndex >= list.length) return [...list];
  if (fromIndex === toIndex) return [...list];

  const nextList = [...list];
  const [item] = nextList.splice(fromIndex, 1) as [T];

  nextList.splice(toIndex, 0, item);
  return nextList;
}

export function getItemsByOrder<TItem extends { id: PropertyKey }>(
  items: readonly TItem[],
  ids: readonly TItem["id"][],
): TItem[] {
  if (ids.length === 0) return [];

  const itemsById = new Map(items.map(item => [item.id, item]));

  return ids.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
}

export function buildPlaybackQueue<T>(
  items: readonly T[],
  startIndex: number | null,
  shuffled: boolean,
): PlaybackQueue<T> {
  const safeIndex = startIndex === null ? -1 : clampQueueIndex(startIndex, items.length);

  if (!shuffled) {
    return {
      items: [...items],
      playbackIndex: safeIndex,
    };
  }

  const current = safeIndex >= 0 ? items[safeIndex] : undefined;

  if (!current) {
    return {
      items: fisherYatesShuffle([...items]),
      playbackIndex: items.length > 0 ? 0 : -1,
    };
  }

  const rest = items.filter((_, index) => index !== safeIndex);

  return {
    items: [current, ...fisherYatesShuffle(rest)],
    playbackIndex: 0,
  };
}

export interface QueueSortSuggestion {
  sameList: boolean;
  sourceIndexes: number[];
  targetIndex: number;
}

/**
 * Maps a vue-dnd-kit suggestSort result (indexes local to the "up next"
 * slice) to absolute queue indexes for moveTrack. suggestSort's targetIndex
 * is the insertion index after removal — the same semantics as moveItem.
 */
export const resolveQueueReorder = (
  suggestion: QueueSortSuggestion,
  sliceOffset: number,
): { from: number; to: number } | null => {
  if (!suggestion.sameList) return null;

  const [from] = suggestion.sourceIndexes;
  if (from === undefined || from === suggestion.targetIndex) return null;

  return { from: from + sliceOffset, to: suggestion.targetIndex + sliceOffset };
};
