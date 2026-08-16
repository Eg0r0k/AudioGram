import { db } from "@/db";
import type { ListenEventEntity } from "@/db/entities";
import type { TagId, TrackId } from "@/types/ids";
import { err, ok, type Result } from "neverthrow";

export interface TopEntry {
  id: string;
  count: number;
  secondsListened: number;
}

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

export interface SonicProfile {
  trackCount: number;
  avgBpm: number;
  avgEnergy: number;
  avgDanceability: number;
  majorRatio: number;
}

export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface StatsSummary {
  totalSeconds: number;
  playsCount: number;
  uniqueTracks: number;
  uniqueArtists: number;
  completedCount: number;
  skippedCount: number;
}

/** Ключ локального дня (не UTC): "2026-05-03". */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function runSafe<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  }
  catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

class StatsRepository {
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
    return runSafe(async () => {
      const events = since
        ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
        : await db.listenEvents.toArray();

      const map = new Map<string, TopEntry>();
      for (const e of events) {
        if (e.skipped) continue;
        const entry = map.get(e.trackId) ?? { id: e.trackId, count: 0, secondsListened: 0 };
        entry.count++;
        entry.secondsListened += e.secondsListened;
        map.set(e.trackId, entry);
      }
      return [...map.values()].sort((a, b) => b.secondsListened - a.secondsListened).slice(0, limit);
    });
  }

  async topArtists(limit = 10, since?: number): Promise<Result<TopEntry[], Error>> {
    return runSafe(async () => {
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
      return [...map.values()].sort((a, b) => b.secondsListened - a.secondsListened).slice(0, limit);
    });
  }

  async topGenres(limit = 8, since?: number): Promise<Result<TopGenreEntry[], Error>> {
    return runSafe(async () => {
      const events = since
        ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
        : await db.listenEvents.toArray();

      const played = events.filter(e => !e.skipped);
      if (played.length === 0) return [];

      const trackIds = [...new Set(played.map(e => e.trackId))];
      const tracks = await db.tracks.where("id").anyOf(trackIds).toArray();
      const trackTagMap = new Map(tracks.map(t => [t.id, t.tagIds]));

      const allTagIds = [...new Set(tracks.flatMap(t => t.tagIds))];
      const tags = await db.tags.where("id").anyOf(allTagIds).toArray();
      const tagNameMap = new Map(tags.map(t => [t.id, t.name]));

      const map = new Map<string, TopGenreEntry>();
      for (const e of played) {
        for (const tagId of trackTagMap.get(e.trackId) ?? []) {
          const entry = map.get(tagId) ?? {
            id: tagId,
            name: tagNameMap.get(tagId) ?? "Без жанра",
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
    return runSafe(async () => {
      const events = since
        ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
        : await db.listenEvents.toArray();
      return events.reduce((sum, e) => sum + e.secondsListened, 0);
    });
  }

  async summary(since?: number): Promise<Result<StatsSummary, Error>> {
    return runSafe(async () => {
      const events = since
        ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
        : await db.listenEvents.toArray();

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
    });
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
        const day = new Date(e.startedAt).toISOString().slice(0, 10);
        map.set(day, (map.get(day) ?? 0) + e.secondsListened);
      }

      const points: DailyActivityPoint[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
        points.push({ date, seconds: map.get(date) ?? 0 });
      }
      return points;
    });
  }

  async sonicProfile(since?: number): Promise<Result<SonicProfile, Error>> {
    return runSafe(async () => {
      const events = since
        ? await db.listenEvents.where("startedAt").aboveOrEqual(since).toArray()
        : await db.listenEvents.toArray();

      const trackIds = [...new Set(events.filter(e => !e.skipped).map(e => e.trackId))];
      const empty: SonicProfile = { trackCount: 0, avgBpm: 0, avgEnergy: 0, avgDanceability: 0, majorRatio: 0 };
      if (trackIds.length === 0) return empty;

      const features = await db.audioFeatures.where("trackId").anyOf(trackIds).toArray();
      if (features.length === 0) return empty;

      const sum = features.reduce(
        (acc, f) => ({
          bpm: acc.bpm + f.bpm,
          energy: acc.energy + f.energy,
          danceability: acc.danceability + f.danceability,
          major: acc.major + (f.mode === 1 ? 1 : 0),
        }),
        { bpm: 0, energy: 0, danceability: 0, major: 0 },
      );

      const n = features.length;
      return {
        trackCount: n,
        avgBpm: sum.bpm / n,
        avgEnergy: sum.energy / n,
        avgDanceability: sum.danceability / n,
        majorRatio: sum.major / n,
      };
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
}

export const statsRepository = new StatsRepository();
