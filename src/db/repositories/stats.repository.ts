import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";

export interface TopEntry {
  id: string;
  count: number;
  secondsListened: number;
}

class StatsRepository {
  async recentHistory(limit = 100): Promise<ListenEventEntity[]> {
    return db.listenEvents
      .orderBy("startedAt")
      .reverse()
      .limit(limit)
      .toArray();
  }

  async topTracks(limit = 10, since?: number): Promise<TopEntry[]> {
    const query = db.listenEvents.where("startedAt");
    const events = since
      ? await query.aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();
    const map = new Map<string, TopEntry>();
    for (const e of events) {
      if (e.skipped) continue;
      const entry = map.get(e.trackId) ?? { id: e.trackId, count: 0, secondsListened: 0 };
      entry.count++;
      entry.secondsListened += e.secondsListened;
      map.set(e.trackId, entry);
    }

    return [...map.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async topArtists(limit = 10, since?: number): Promise<TopEntry[]> {
    const events = since
      ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();

    const map = new Map<string, TopEntry>();
    for (const e of events) {
      if (e.skipped) continue;
      const entry = map.get(e.artistId) ?? { id: e.artistId, count: 0, secondsListened: 0 };
      entry.count++;
      entry.secondsListened += e.secondsListened;
      map.set(e.artistId, entry);
    }

    return [...map.values()]
      .sort((a, b) => b.secondsListened - a.secondsListened)
      .slice(0, limit);
  }

  async totalListeningSeconds(since?: number): Promise<number> {
    const events = since
      ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : await db.listenEvents.toArray();

    return events.reduce((sum, e) => sum + e.secondsListened, 0);
  }

  async dailyActivity(days = 30): Promise<Map<string, number>> {
    const since = Date.now() - days * 86_400_000;
    const events = await db.listenEvents
      .where("startedAt")
      .aboveOrEqual(since)
      .toArray();

    const map = new Map<string, number>();
    for (const e of events) {
      const day = new Date(e.startedAt).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + e.secondsListened);
    }
    return map;
  }

  async findAllEvents(): Promise<ListenEventEntity[]> {
    return db.listenEvents.toArray();
  }
}

export const statsRepository = new StatsRepository();
