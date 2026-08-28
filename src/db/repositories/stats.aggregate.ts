import type { ListenEventEntity } from "@/db/entities";
import type { TrackId } from "@/types/ids";

//
// Pure aggregations over a slice of listen events. The stats page shows many
// of these for one period at once; the caller reads the events once and
// feeds the same array to every aggregate here.
//

export interface TopEntry {
  id: string;
  count: number;
  secondsListened: number;
}

export interface StatsSummary {
  totalSeconds: number;
  playsCount: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedCount: number;
  skippedCount: number;
}

export interface StatsRecords {
  busiestDay: { date: string; seconds: number } | null;
  mostRepeatedTrackId: TrackId | null;
  mostRepeatedCount: number;
  longestSessionSeconds: number;
}

export const SESSION_GAP_MS = 30 * 60 * 1000;

/** Local-day key (not UTC): "2026-05-03". */
export const localDayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const topBy = (
  events: readonly ListenEventEntity[],
  keyOf: (event: ListenEventEntity) => string,
  limit: number,
): TopEntry[] => {
  const map = new Map<string, TopEntry>();
  for (const e of events) {
    if (e.skipped) continue;
    const id = keyOf(e);
    const entry = map.get(id) ?? { id, count: 0, secondsListened: 0 };
    entry.count++;
    entry.secondsListened += e.secondsListened;
    map.set(id, entry);
  }
  return [...map.values()].sort((a, b) => b.secondsListened - a.secondsListened).slice(0, limit);
};

export const aggregateTopTracks = (events: readonly ListenEventEntity[], limit: number): TopEntry[] =>
  topBy(events, e => e.trackId, limit);

export const aggregateTopArtists = (events: readonly ListenEventEntity[], limit: number): TopEntry[] =>
  topBy(events, e => e.artistId, limit);

export const aggregateTotalSeconds = (events: readonly ListenEventEntity[]): number =>
  events.reduce((sum, e) => sum + e.secondsListened, 0);

export const aggregateSummary = (events: readonly ListenEventEntity[]): StatsSummary => {
  const tracks = new Set<string>();
  const artists = new Set<string>();
  const result: StatsSummary = {
    totalSeconds: 0,
    playsCount: 0,
    uniqueTracks: 0,
    uniqueArtists: 0,
    completedCount: 0,
    skippedCount: 0,
  };

  for (const e of events) {
    result.totalSeconds += e.secondsListened;
    if (e.skipped) {
      result.skippedCount++;
      continue;
    }
    result.playsCount++;
    if (e.completed) result.completedCount++;
    tracks.add(e.trackId);
    artists.add(e.artistId);
  }

  result.uniqueTracks = tracks.size;
  result.uniqueArtists = artists.size;
  return result;
};

/** Seconds listened per local hour of day, index 0–23. */
export const aggregateHourly = (events: readonly ListenEventEntity[]): number[] => {
  const hours = new Array<number>(24).fill(0);
  for (const e of events) {
    hours[new Date(e.startedAt).getHours()] += e.secondsListened;
  }
  return hours;
};

export const aggregateRecords = (events: readonly ListenEventEntity[]): StatsRecords => {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const key = localDayKey(new Date(e.startedAt));
    byDay.set(key, (byDay.get(key) ?? 0) + e.secondsListened);
  }
  let busiestDay: StatsRecords["busiestDay"] = null;
  for (const [date, seconds] of byDay) {
    if (!busiestDay || seconds > busiestDay.seconds) busiestDay = { date, seconds };
  }

  const counts = new Map<TrackId, number>();
  for (const e of events) {
    if (e.skipped) continue;
    counts.set(e.trackId, (counts.get(e.trackId) ?? 0) + 1);
  }
  let mostRepeatedTrackId: TrackId | null = null;
  let mostRepeatedCount = 0;
  for (const [id, count] of counts) {
    if (count > mostRepeatedCount) {
      mostRepeatedTrackId = id;
      mostRepeatedCount = count;
    }
  }

  const played = events
    .filter(e => !e.skipped)
    .sort((a, b) => a.startedAt - b.startedAt);
  let longestSessionSeconds = 0;
  let current = 0;
  let prevStartedAt: number | null = null;
  for (const e of played) {
    if (prevStartedAt !== null && e.startedAt - prevStartedAt > SESSION_GAP_MS) {
      current = 0;
    }
    current += e.secondsListened;
    longestSessionSeconds = Math.max(longestSessionSeconds, current);
    prevStartedAt = e.startedAt;
  }

  return { busiestDay, mostRepeatedTrackId, mostRepeatedCount, longestSessionSeconds };
};
