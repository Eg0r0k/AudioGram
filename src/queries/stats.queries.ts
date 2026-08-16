import { statsRepository } from "@/db/repositories/stats.repository";
import {
  artistRepository,
  trackRepository,
} from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import type { TrackId, ArtistId } from "@/types/ids";
import { queryOptions } from "@tanstack/vue-query";
import type { QueryClient } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";
import { mapTrackEntityToPlayerTrack } from "@/modules/player/utils/trackEntity";

export interface RecentHistoryEntry {
  eventId: string;
  listenedAt: number;
  secondsListened: number;
  completed: boolean;
  skipped: boolean;
  track: ReturnType<typeof mapTrackEntityToPlayerTrack>;
}

const STATS_STALE_TIME = 5 * 60 * 1000;

export const statsQueries = {
  topTracks: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topTracks(limit, since),
      queryFn: () => unwrapResult(statsRepository.topTracks(limit, since)),
      staleTime: STATS_STALE_TIME,
    }),
  topTracksMeta: (ids: readonly string[]) =>
    queryOptions({
      queryKey: queryKeys.stats.topTracksMeta(ids),
      queryFn: () => unwrapResult(trackRepository.findByIds(ids as TrackId[])),
      staleTime: STATS_STALE_TIME,
    }),
  topArtists: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topArtists(limit, since),
      queryFn: () => unwrapResult(statsRepository.topArtists(limit, since)),
      staleTime: STATS_STALE_TIME,
    }),
  topArtistsMeta: (ids: readonly string[]) =>
    queryOptions({
      queryKey: queryKeys.stats.topArtistsMeta(ids),
      queryFn: () => unwrapResult(artistRepository.findByIds(ids as ArtistId[])),
      staleTime: STATS_STALE_TIME,
    }),
  topGenres: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topGenres(limit, since),
      queryFn: () => unwrapResult(statsRepository.topGenres(limit, since)),
      staleTime: STATS_STALE_TIME,
    }),
  sonicProfile: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.sonicProfile(since),
      queryFn: () => unwrapResult(statsRepository.sonicProfile(since)),
      staleTime: STATS_STALE_TIME,
    }),
  totalTime: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.totalTime(since),
      queryFn: () => unwrapResult(statsRepository.totalListeningSeconds(since)),
      staleTime: STATS_STALE_TIME,
    }),
  dailyActivity: (days: number) =>
    queryOptions({
      queryKey: queryKeys.stats.dailyActivity(days),
      // dailyActivity уже возвращает непрерывный массив {date, seconds}[] с нулями в пропусках
      queryFn: () => unwrapResult(statsRepository.dailyActivity(days)),
      staleTime: STATS_STALE_TIME,
    }),
  summary: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.summary(since),
      queryFn: () => unwrapResult(statsRepository.summary(since)),
      staleTime: STATS_STALE_TIME,
    }),
  hourlyActivity: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.hourlyActivity(since),
      queryFn: () => unwrapResult(statsRepository.hourlyActivity(since)),
      staleTime: STATS_STALE_TIME,
    }),
  records: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.records(since),
      queryFn: () => unwrapResult(statsRepository.records(since)),
      staleTime: STATS_STALE_TIME,
    }),
  streaks: () =>
    queryOptions({
      queryKey: queryKeys.stats.streaks(),
      queryFn: () => unwrapResult(statsRepository.streaks()),
      staleTime: STATS_STALE_TIME,
    }),
  recentHistory: (limit: number) =>
    queryOptions({
      queryKey: queryKeys.stats.recentHistory(limit),
      queryFn: async (): Promise<RecentHistoryEntry[]> => {
        const events = await unwrapResult(statsRepository.recentHistory(limit));
        const trackIds = events.map(event => event.trackId);
        const tracks = await unwrapResult(trackRepository.findByIds(trackIds));
        const tracksById = new Map(tracks.map(track => [track.id, mapTrackEntityToPlayerTrack(track)]));

        return events.flatMap((event) => {
          const track = tracksById.get(event.trackId);
          if (!track) return [];

          return [{
            eventId: event.id,
            listenedAt: event.startedAt,
            secondsListened: event.secondsListened,
            completed: event.completed,
            skipped: event.skipped,
            track,
          }];
        });
      },
      staleTime: 10_000,
    }),
} as const;

export function invalidateStatsQueries(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: queryKeys.stats.all() });
}
