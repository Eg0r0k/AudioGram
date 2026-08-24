import type { TrackSortKey } from "@/modules/tracks/types";

export type TrackSortField = "title" | "artist" | "album" | "dateAdded" | "duration";

const SORT_KEYS: Record<TrackSortField, readonly [TrackSortKey, TrackSortKey]> = {
  title: ["title_asc", "title_desc"],
  artist: ["artist_asc", "artist_desc"],
  album: ["album_asc", "album_desc"],
  dateAdded: ["date_added_asc", "date_added_desc"],
  duration: ["duration_asc", "duration_desc"],
};

export type TrackSortDirection = "asc" | "desc";

/** Which way `sortKey` sorts `field`, or null when it sorts something else. */
export const getTrackSortDirection = (
  sortKey: TrackSortKey | null,
  field: TrackSortField,
): TrackSortDirection | null => {
  const [asc, desc] = SORT_KEYS[field];
  if (sortKey === asc) return "asc";
  if (sortKey === desc) return "desc";
  return null;
};

export function getNextTrackSortKey(
  current: TrackSortKey | null,
  field: TrackSortField,
): TrackSortKey | null {
  const [asc, desc] = SORT_KEYS[field];

  if (current !== asc && current !== desc) {
    return asc;
  }

  return current === asc ? desc : null;
}
