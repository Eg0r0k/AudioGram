import { statsRepository } from "@/db/repositories/stats.repository";
import {
  aggregateHourly,
  aggregateRecords,
  aggregateSummary,
  aggregateTopArtists,
  aggregateTopTracks,
  aggregateTotalSeconds,
} from "@/db/repositories/stats.aggregate";
import {
  artistRepository,
  trackRepository,
} from "@/db/repositories";
import type { ListenEventEntity } from "@/db/entities";
import { queryKeys } from "@/queries/query-keys";
import type { TrackId, ArtistId } from "@/types/ids";
import { keepPreviousData, queryOptions } from "@tanstack/vue-query";
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

export interface TopTrackEntry {
  id: string;
  count: number;
  secondsListened: number;
  track: ReturnType<typeof mapTrackEntityToPlayerTrack>;
}

const STATS_STALE_TIME = 5 * 60 * 1000;

// The stats page mounts ~8 aggregates for one period. Each aggregate query
// resolves the period's events through the shared `events` query (one
// listenEvents read, deduped by TanStack) and reduces them in memory.
const eventsQuery = (since?: number) =>
  queryOptions({
    queryKey: queryKeys.stats.events(since),
    queryFn: (): Promise<ListenEventEntity[]> => unwrapResult(statsRepository.eventsSince(since)),
    staleTime: STATS_STALE_TIME,
  });

// fetchQuery, not ensureQueryData: the events entry has no observer, so an
// invalidation only marks it stale, and ensureQueryData hands stale data back.
const eventsOf = (client: QueryClient, since?: number) => client.fetchQuery(eventsQuery(since));

export const statsQueries = {
  events: eventsQuery,
  // Ряды топов собираются одним запросом (события + метаданные), чтобы при
  // смене периода не было второй волны загрузки на meta-ключе.
  topTracks: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topTracks(limit, since),
      queryFn: async ({ client }): Promise<TopTrackEntry[]> => {
        const entries = aggregateTopTracks(await eventsOf(client, since), limit);
        const tracks = await unwrapResult(
          trackRepository.findByIds(entries.map(entry => entry.id as TrackId)),
        );
        const tracksById = new Map(
          tracks.map(track => [track.id as string, mapTrackEntityToPlayerTrack(track)]),
        );

        return entries.flatMap((entry) => {
          const track = tracksById.get(entry.id);
          return track ? [{ ...entry, track }] : [];
        });
      },
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  topTracksMeta: (ids: readonly string[]) =>
    queryOptions({
      queryKey: queryKeys.stats.topTracksMeta(ids),
      queryFn: () => unwrapResult(trackRepository.findByIds(ids as TrackId[])),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  topArtists: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topArtists(limit, since),
      queryFn: async ({ client }) => {
        const entries = aggregateTopArtists(await eventsOf(client, since), limit);
        const artists = await unwrapResult(
          artistRepository.findByIds(entries.map(entry => entry.id as ArtistId)),
        );
        const artistsById = new Map(artists.map(artist => [artist.id as string, artist]));

        return entries.flatMap((entry) => {
          const artist = artistsById.get(entry.id);
          return artist ? [{ ...entry, artist }] : [];
        });
      },
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  artistPlays: (artistId: string) =>
    queryOptions({
      queryKey: queryKeys.stats.artistPlays(artistId),
      queryFn: () => unwrapResult(statsRepository.artistPlaysCount(artistId)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  topGenres: (limit: number, since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.topGenres(limit, since),
      queryFn: async ({ client }) =>
        unwrapResult(statsRepository.topGenresOf(await eventsOf(client, since), limit)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  totalTime: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.totalTime(since),
      queryFn: async ({ client }) => aggregateTotalSeconds(await eventsOf(client, since)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  dailyActivity: (days: number) =>
    queryOptions({
      queryKey: queryKeys.stats.dailyActivity(days),
      // dailyActivity уже возвращает непрерывный массив {date, seconds}[] с нулями в пропусках
      queryFn: () => unwrapResult(statsRepository.dailyActivity(days)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  summary: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.summary(since),
      queryFn: async ({ client }) => aggregateSummary(await eventsOf(client, since)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  hourlyActivity: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.hourlyActivity(since),
      queryFn: async ({ client }) => aggregateHourly(await eventsOf(client, since)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
    }),
  records: (since?: number) =>
    queryOptions({
      queryKey: queryKeys.stats.records(since),
      queryFn: async ({ client }) => aggregateRecords(await eventsOf(client, since)),
      staleTime: STATS_STALE_TIME,
      placeholderData: keepPreviousData,
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
