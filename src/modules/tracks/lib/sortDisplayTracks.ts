import type { Track } from "@/modules/player/types";
import type { TrackSortKey } from "../types";

/**
 * `sortTracks` (queries/shared) counterpart for display VMs: remote (ND)
 * pages hold the full track list in memory, so the sort header works on the
 * same client-side comparator local pages use — just over VM field names.
 * Keys the catalog rows have no data for (date added, plays) keep the
 * canonical server order: Array.sort is stable.
 */
export function sortDisplayTracks(tracks: Track[], sortKey: TrackSortKey): Track[] {
  const isDesc = sortKey.endsWith("_desc");
  const getSortValue = (track: Track): string | number => {
    switch (sortKey) {
      case "title_asc": case "title_desc": return track.title || "";
      case "duration_asc": case "duration_desc": return track.duration || 0;
      case "plays_desc": return track.playCount || 0;
      case "artist_asc": case "artist_desc": return track.artist || "";
      case "album_asc": case "album_desc": return track.albumName || "";
      default: return track.addedAt || 0;
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
