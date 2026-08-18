import { db } from "@/db";
import { deduplicate } from "@/lib/math";
import type { TrackId } from "@/types/ids";
import { SESSION_GAP_MS } from "@/db/repositories/stats.repository";
const MIN_SESSION_LENGTH = 2;
const MAX_HISTORY_DAYS = 90;

export type Session = TrackId[];

export async function buildSessions(): Promise<Session[]> {
  const since = Date.now() - MAX_HISTORY_DAYS * 86_400_000;

  const events = await db.listenEvents
    .where("startedAt")
    .aboveOrEqual(since)
    .toArray();

  const sorted = events
    .filter(e => !e.skipped)
    .sort((a, b) => a.startedAt - b.startedAt);

  if (sorted.length === 0) return [];

  const sessions: Session[] = [];
  let current: TrackId[] = [sorted[0].trackId];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].startedAt - sorted[i - 1].startedAt;
    if (gap > SESSION_GAP_MS) {
      if (current.length >= MIN_SESSION_LENGTH) {
        sessions.push(deduplicate(current));
      }
      current = [sorted[i].trackId];
    }
    else {
      current.push(sorted[i].trackId);
    }
  }

  if (current.length >= MIN_SESSION_LENGTH) {
    sessions.push(deduplicate(current));
  }

  return sessions;
}

export function buildCoOccurrenceMatrix(
  sessions: Session[],
): Map<TrackId, Map<TrackId, number>> {
  const rawCounts = new Map<TrackId, Map<TrackId, number>>();
  const sessionCounts = new Map<TrackId, number>();

  for (const session of sessions) {
    const unique = new Set(session);
    for (const id of unique) {
      sessionCounts.set(id, (sessionCounts.get(id) ?? 0) + 1);
    }

    const list = [...unique];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!rawCounts.has(a)) rawCounts.set(a, new Map());
        if (!rawCounts.has(b)) rawCounts.set(b, new Map());
        rawCounts.get(a)!.set(b, (rawCounts.get(a)!.get(b) ?? 0) + 1);
        rawCounts.get(b)!.set(a, (rawCounts.get(b)!.get(a) ?? 0) + 1);
      }
    }
  }

  const normalized = new Map<TrackId, Map<TrackId, number>>();
  for (const [a, bMap] of rawCounts) {
    const normBMap = new Map<TrackId, number>();
    const countA = sessionCounts.get(a) ?? 1;
    for (const [b, raw] of bMap) {
      normBMap.set(b, raw / Math.sqrt(countA * (sessionCounts.get(b) ?? 1)));
    }
    normalized.set(a, normBMap);
  }

  return normalized;
}
