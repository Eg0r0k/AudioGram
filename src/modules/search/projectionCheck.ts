import type { SearchDocument } from "./types";

// Dev-only invariant: the index is synced by explicit upsert/remove calls,
// so a missed call silently diverges it — verify on every full build.

export function countTrackDocuments(documents: readonly SearchDocument[]): number {
  return documents.reduce((count, document) => (document.type === "track" ? count + 1 : count), 0);
}

/** Returns the drift report, or null when the projection is consistent. */
export function trackProjectionMismatch(
  dbTrackCount: number,
  indexedTrackCount: number,
): string | null {
  if (dbTrackCount === indexedTrackCount) return null;

  return `[Search] Projection drift: ${indexedTrackCount} track documents in the index `
    + `vs ${dbTrackCount} track rows in the database. A sync call is likely missing after `
    + `some mutation; rebuild the index (rebuildSearchIndex) to recover.`;
}
