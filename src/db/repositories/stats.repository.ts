import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";
import type { TagId, TrackId } from "@/types/ids";
import { toDbError } from "@/db/errors/db.errors";
import { err, ok, type Result } from "neverthrow";
import {
  aggregateHourly,
  aggregateRecords,
  aggregateSummary,
  aggregateTopArtists,
  aggregateTopTracks,
  aggregateTotalSeconds,
  localDayKey,
  type StatsRecords,
  type StatsSummary,
  type TopEntry,
} from "./stats.aggregate";

export { SESSION_GAP_MS, type StatsRecords, type StatsSummary, type TopEntry } from "./stats.aggregate";

export interface TopGenreEntry {
  id: TagId | "other";
  name: string;
  count: number;
  secondsListened: number;
}

export interface DailyActivityPoint {
  date: string; // YYYY-MM-DD
  seconds: number;
}

export interface StreakInfo {
  current: number;
  best: number;
}

async function runSafe<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  }
  catch (error) {
    return err(toDbError(error));
  }
}

class StatsRepository {
  /**
   * Events of a period — the single read the stats page aggregates share
   * (see stats.queries). `since` undefined = all time.
   */
  async eventsSince(since?: number): Promise<Result<ListenEventEntity[], Error>> {
    return runSafe(() => since
      ? db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
      : db.listenEvents.toArray());
  }

  /**
   * Последние прослушанные треки, без повторов: если трек прослушивался
   * много раз, в списке остаётся только его самое недавнее прослушивание
   * (трек просто "поднимается" наверх при повторном воспроизведении —
   * как это обычно устроено в "Recently played").
   */
  async recentHistory(limit = 100): Promise<Result<ListenEventEntity[], Error>> {
    return runSafe(async () => {
      const seenTrackIds = new Set<TrackId>();
      const result: ListenEventEntity[] = [];

      const BATCH_SIZE = Math.max(limit * 5, 200);
      let offset = 0;

      while (result.length < limit) {
        const batch = await db.listenEvents
          .orderBy("startedAt")
          .reverse()
          .offset(offset)
          .limit(BATCH_SIZE)
          .toArray();

        if (batch.length === 0) break;

        for (const event of batch) {
          if (seenTrackIds.has(event.trackId)) continue;
          seenTrackIds.add(event.trackId);
          result.push(event);
          if (result.length >= limit) break;
        }

        offset += batch.length;
        if (batch.length < BATCH_SIZE) break;
      }

      return result;
    });
  }

  async topTracks(limit = 10, since?: number): Promise<Result<TopEntry[], Error>> {
    return (await this.eventsSince(since)).map(events => aggregateTopTracks(events, limit));
  }

  async topArtists(limit = 10, since?: number): Promise<Result<TopEntry[], Error>> {
    return (await this.eventsSince(since)).map(events => aggregateTopArtists(events, limit));
  }

  async artistPlaysCount(artistId: string): Promise<Result<number, Error>> {
    return runSafe(() =>
      db.listenEvents.where("artistId").equals(artistId).and(e => !e.skipped).count(),
    );
  }

  async topGenres(limit = 8, since?: number): Promise<Result<TopGenreEntry[], Error>> {
    const events = await this.eventsSince(since);
    if (events.isErr()) return err(events.error);
    return this.topGenresOf(events.value, limit);
  }

  /** Genre ranking over already-loaded events (needs the tracks' tags from the DB). */
  async topGenresOf(events: readonly ListenEventEntity[], limit = 8): Promise<Result<TopGenreEntry[], Error>> {
    return runSafe(async () => {
      const played = events.filter(e => !e.skipped);
      if (played.length === 0) return [];

      const trackIds = [...new Set(played.map(e => e.trackId))];
      const tracks = (await db.tracks.bulkGet(trackIds)).filter(t => t !== undefined);
      const trackTagMap = new Map(tracks.map(t => [t.id, t.tagIds]));

      const allTagIds = [...new Set(tracks.flatMap(t => t.tagIds))];
      const tags = (await db.tags.bulkGet(allTagIds)).filter(t => t !== undefined);
      const tagNameMap = new Map(tags.map(t => [t.id, t.name]));

      const map = new Map<string, TopGenreEntry>();
      for (const e of played) {
        for (const tagId of trackTagMap.get(e.trackId) ?? []) {
          const entry = map.get(tagId) ?? {
            id: tagId,
            name: tagNameMap.get(tagId) ?? "",
            count: 0,
            secondsListened: 0,
          };
          entry.count++;
          entry.secondsListened += e.secondsListened;
          map.set(tagId, entry);
        }
      }
      return [...map.values()].sort((a, b) => b.secondsListened - a.secondsListened).slice(0, limit);
    });
  }

  async totalListeningSeconds(since?: number): Promise<Result<number, Error>> {
    return (await this.eventsSince(since)).map(aggregateTotalSeconds);
  }

  async summary(since?: number): Promise<Result<StatsSummary, Error>> {
    return (await this.eventsSince(since)).map(aggregateSummary);
  }

  async deleteAllEvents(): Promise<Result<void, Error>> {
    return runSafe(async () => {
      await db.listenEvents.clear();
    });
  }

  async dailyActivity(days = 30): Promise<Result<DailyActivityPoint[], Error>> {
    return runSafe(async () => {
      const since = Date.now() - days * 86_400_000;
      const events = await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray();

      const map = new Map<string, number>();
      for (const e of events) {
        const day = localDayKey(new Date(e.startedAt));
        map.set(day, (map.get(day) ?? 0) + e.secondsListened);
      }

      const points: DailyActivityPoint[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = localDayKey(new Date(Date.now() - i * 86_400_000));
        points.push({ date, seconds: map.get(date) ?? 0 });
      }
      return points;
    });
  }

  async findAllEvents(): Promise<Result<ListenEventEntity[], Error>> {
    return runSafe(() => db.listenEvents.toArray());
  }

  async deleteEvent(eventId: string): Promise<Result<void, Error>> {
    return runSafe(() => db.listenEvents.delete(eventId));
  }

  async deleteEventsForTrack(trackId: TrackId): Promise<Result<void, Error>> {
    return runSafe(async () => {
      await db.listenEvents.where("trackId").equals(trackId).delete();
    });
  }

  async hourlyActivity(since?: number): Promise<Result<number[], Error>> {
    return (await this.eventsSince(since)).map(aggregateHourly);
  }

  async records(since?: number): Promise<Result<StatsRecords, Error>> {
    return (await this.eventsSince(since)).map(aggregateRecords);
  }

  async streaks(now = Date.now()): Promise<Result<StreakInfo, Error>> {
    return runSafe(async () => {
      const DAYS = 365;
      const since = now - DAYS * 86_400_000;
      const events = await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray();

      const activeDays = new Set<string>();
      for (const e of events) {
        if (e.secondsListened <= 0) continue;
        activeDays.add(localDayKey(new Date(e.startedAt)));
      }

      let best = 0;
      let run = 0;
      for (let i = DAYS; i >= 0; i--) {
        if (activeDays.has(localDayKey(new Date(now - i * 86_400_000)))) {
          run++;
          best = Math.max(best, run);
        }
        else {
          run = 0;
        }
      }

      // Текущая серия: сегодня без прослушиваний ещё не разрыв — день не кончился.
      let current = 0;
      const startOffset = activeDays.has(localDayKey(new Date(now))) ? 0 : 1;
      for (let i = startOffset; i <= DAYS; i++) {
        if (!activeDays.has(localDayKey(new Date(now - i * 86_400_000)))) break;
        current++;
      }

      return { current, best };
    });
  }
}

export const statsRepository = new StatsRepository();
