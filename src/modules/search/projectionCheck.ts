import type { SearchDocument } from "./types";

//
// Dev-only invariant for the search projection: the index is synced by
// explicit upsert/remove calls scattered across mutations, so a missed call
// silently diverges it from the database. The full build is the one moment
// the whole projection is in hand — compare it against the table then.
//

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
