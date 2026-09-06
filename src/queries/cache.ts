import type {
  AlbumEntity,
  ArtistEntity,
  CoverOwnerType,
  PlaylistEntity,
  TrackEntity,
} from "@/db/entities";
import { queryKeys } from "@/queries/query-keys";
import type { Track } from "@/modules/player/types";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import type { InfiniteData, QueryClient } from "@tanstack/vue-query";
import { patchTrackEntityLike, patchTrackLike, removeById, upsertById } from "./shared";
import type {
  AlbumPageData,
  AlbumWithTrackCount,
  ArtistPageData,
  ArtistWithTrackCount,
  LibrarySummaryData,
  LikedTracksPageData,
  PaginatedAlbumsResult,
  PaginatedTracksResult,
  PlaylistPageData,
  TracksIndexPageData,
} from "./types";
import { coverCache } from "@/modules/covers/lib/cover-cache";

function setQueryDataIfPresent<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (data: T) => T,
) {
  queryClient.setQueryData<T | undefined>(queryKey, old =>
    old === undefined ? old : updater(old),
  );
}

function setQueriesDataIfPresent<T>(
  queryClient: QueryClient,
  filters: Parameters<QueryClient["setQueriesData"]>[0],
  updater: (data: T) => T,
) {
  queryClient.setQueriesData<T | undefined>(filters, (old) => {
    if (old === undefined) return old;
    const result = updater(old);
    return result;
  });
}

function patchLikedTotalDuration(queryClient: QueryClient, delta: number) {
  if (delta === 0) return;
  setQueryDataIfPresent<number>(queryClient, queryKeys.tracks.likedTotalDuration(), current =>
    Math.max(0, current + delta),
  );
}

function sortLikedTracksDesc(tracks: readonly TrackEntity[]) {
  return [...tracks].sort((left, right) => (right.likedAt ?? 0) - (left.likedAt ?? 0));
}

// Cache updaters are dispatched by key predicates; a mis-scoped predicate could
// hand a page updater the wrong cache shape (e.g. a scalar aggregate). Guard the
// shape and no-op instead of crashing.
function isPagedData(data: unknown): boolean {
  return Array.isArray((data as { pages?: unknown } | null | undefined)?.pages);
}

function mapInfiniteTrackPages(
  data: InfiniteData<PaginatedTracksResult>,
  mapTracks: (tracks: Track[]) => Track[],
): InfiniteData<PaginatedTracksResult> {
  if (!isPagedData(data)) return data;
  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      tracks: mapTracks(page.tracks),
    })),
  };
}

function removeTracksFromInfinitePages(
  data: InfiniteData<PaginatedTracksResult>,
  trackIdSet: ReadonlySet<string>,
): InfiniteData<PaginatedTracksResult> {
  if (!isPagedData(data)) return data;
  const removedTracks = data.pages
    .flatMap(page => page.tracks)
    .filter(track => trackIdSet.has(track.id));

  const removedCount = removedTracks.length;

  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      tracks: page.tracks.filter(track => !trackIdSet.has(track.id)),
      total: Math.max(0, page.total - removedCount),
    })),
  };
}

function removeAlbumFromInfinitePages(
  data: InfiniteData<PaginatedAlbumsResult>,
  albumId: AlbumId,
): InfiniteData<PaginatedAlbumsResult> {
  if (!isPagedData(data)) return data;
  return {
    ...data,
    pages: data.pages.map(page => ({
      ...page,
      albums: page.albums.filter(album => album.id !== albumId),
      total: Math.max(0, page.total - 1),
    })),
  };
}

function patchInfiniteLikedPages(
  data: InfiniteData<PaginatedTracksResult>,
  nextTrack: Track,
): InfiniteData<PaginatedTracksResult> {
  if (!isPagedData(data)) return data;
  const totalDelta = nextTrack.isLiked ? 1 : -1;

  return {
    ...data,
    pages: data.pages.map((page, index) => {
      const withoutCurrent = page.tracks.filter(track => track.id !== nextTrack.id);

      return {
        ...page,
        tracks: nextTrack.isLiked && index === 0 ? [nextTrack, ...withoutCurrent] : withoutCurrent,
        total: Math.max(0, page.total + totalDelta),
      };
    }),
  };
}

function patchTracksIndexPages(
  queryClient: QueryClient,
  updater: (data: TracksIndexPageData) => TracksIndexPageData,
) {
  setQueriesDataIfPresent<TracksIndexPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "tracks"
        && query.queryKey[1] === "index"
        && query.queryKey[2] !== "infinite"
        && query.queryKey[2] !== "totalDuration",
    },
    data => (Array.isArray((data as { tracks?: unknown }).tracks) ? updater(data) : data),
  );
}

export function syncArtistCaches(queryClient: QueryClient, artist: ArtistEntity) {
  setQueryDataIfPresent<ArtistEntity[]>(queryClient, queryKeys.artists.all(), artists =>
    upsertById(artists, artist),
  );
  queryClient.setQueryData(queryKeys.artists.detail(artist.id), artist);
  setQueryDataIfPresent<ArtistPageData>(queryClient, queryKeys.artists.page(artist.id), data => ({
    ...data,
    artist,
  }));
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      artists: upsertById(data.artists, {
        ...artist,
        trackCount: data.artists.find(existing => existing.id === artist.id)?.trackCount ?? 0,
      }),
    }),
  );
}

export function removeArtistCaches(queryClient: QueryClient, artistId: ArtistId) {
  setQueryDataIfPresent<ArtistEntity[]>(queryClient, queryKeys.artists.all(), artists =>
    removeById(artists, artistId),
  );
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      artists: removeById(data.artists, artistId),
    }),
  );
  queryClient.removeQueries({ queryKey: queryKeys.artists.detail(artistId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.artists.page(artistId), exact: true });
}

export function syncAlbumCaches(queryClient: QueryClient, album: AlbumEntity) {
  setQueryDataIfPresent<AlbumEntity[]>(queryClient, queryKeys.albums.all(), albums =>
    upsertById(albums, album),
  );
  queryClient.setQueryData(queryKeys.albums.detail(album.id), album);
  setQueryDataIfPresent<AlbumPageData>(queryClient, queryKeys.albums.page(album.id), data => ({
    ...data,
    album,
  }));
  setQueryDataIfPresent<ArtistPageData>(
    queryClient,
    queryKeys.artists.page(album.artistId),
    data => ({
      ...data,
      albums: upsertById(data.albums, album),
    }),
  );
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      albums: upsertById(data.albums, {
        ...album,
        trackCount: data.albums.find(existing => existing.id === album.id)?.trackCount ?? 0,
      }),
    }),
  );
}

export function removeAlbumCaches(
  queryClient: QueryClient,
  albumId: AlbumId,
  artistId: ArtistId,
) {
  setQueryDataIfPresent<AlbumEntity[]>(queryClient, queryKeys.albums.all(), albums =>
    removeById(albums, albumId),
  );
  setQueryDataIfPresent<ArtistPageData>(
    queryClient,
    queryKeys.artists.page(artistId),
    data => ({
      ...data,
      albums: removeById(data.albums, albumId),
    }),
  );
  setQueryDataIfPresent<InfiniteData<PaginatedAlbumsResult>>(
    queryClient,
    queryKeys.artists.albums(artistId),
    data => removeAlbumFromInfinitePages(data, albumId),
  );
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      albums: removeById(data.albums, albumId),
    }),
  );
  queryClient.removeQueries({ queryKey: queryKeys.albums.detail(albumId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.albums.page(albumId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.albums.tracks(albumId), exact: true });
}

export function syncPlaylistCaches(queryClient: QueryClient, playlist: PlaylistEntity) {
  setQueryDataIfPresent<PlaylistEntity[]>(queryClient, queryKeys.playlists.all(), playlists =>
    upsertById(playlists, playlist),
  );
  queryClient.setQueryData(queryKeys.playlists.detail(playlist.id), playlist);
  setQueryDataIfPresent<PlaylistPageData>(
    queryClient,
    queryKeys.playlists.page(playlist.id),
    data => ({
      ...data,
      playlist,
    }),
  );
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      playlists: upsertById(data.playlists, playlist),
    }),
  );
}

export function removePlaylistCaches(queryClient: QueryClient, playlistId: PlaylistId) {
  setQueryDataIfPresent<PlaylistEntity[]>(queryClient, queryKeys.playlists.all(), playlists =>
    removeById(playlists, playlistId),
  );
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      playlists: removeById(data.playlists, playlistId),
    }),
  );
  queryClient.removeQueries({ queryKey: queryKeys.playlists.detail(playlistId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.playlists.page(playlistId), exact: true });
  queryClient.removeQueries({ queryKey: queryKeys.playlists.tracks(playlistId), exact: true });
}

export function updateCoverCache(
  ownerType: CoverOwnerType,
  ownerId: string,
  blob: Blob | null,
) {
  coverCache.set({ ownerType, ownerId }, blob);
}

/** A cover row is gone (its owner was deleted or re-parented). */
export function removeCoverCache(ownerType: CoverOwnerType, ownerId: string) {
  coverCache.invalidate({ ownerType, ownerId });
}

export function syncPlaylistTrackRemoval(
  queryClient: QueryClient,
  playlistId: PlaylistId,
  trackId: string,
) {
  setQueryDataIfPresent<PlaylistPageData>(
    queryClient,
    queryKeys.playlists.page(playlistId),
    data => ({
      ...data,
      playlist: {
        ...data.playlist,
        trackIds: data.playlist.trackIds.filter(id => id !== trackId),
      },
      tracks: data.tracks.filter(track => track.id !== trackId),
    }),
  );

  setQueryDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    queryKeys.playlists.tracksPage(playlistId),
    (data) => {
      let removedCount = 0;

      const nextData = mapInfiniteTrackPages(data, (tracks) => {
        const nextTracks = tracks.filter(track => track.id !== trackId);
        removedCount += tracks.length - nextTracks.length;
        return nextTracks;
      });

      if (removedCount === 0) {
        return data;
      }

      return {
        ...nextData,
        pages: nextData.pages.map(page => ({
          ...page,
          total: Math.max(0, page.total - removedCount),
        })),
      };
    },
  );
}

export function syncPlaylistTrackAddition(
  queryClient: QueryClient,
  playlistId: PlaylistId,
  track: Track,
) {
  setQueryDataIfPresent<PlaylistPageData>(
    queryClient,
    queryKeys.playlists.page(playlistId),
    (data) => {
      if (data.playlist.trackIds.includes(track.id)) {
        return data;
      }

      return {
        ...data,
        playlist: {
          ...data.playlist,
          trackIds: [...data.playlist.trackIds, track.id],
        },
        tracks: [...data.tracks, track],
      };
    },
  );
}

export function removeTracksFromCaches(
  queryClient: QueryClient,
  trackIds: readonly string[],
) {
  const trackIdSet = new Set(trackIds);

  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.all(), tracks =>
    tracks.filter(track => !trackIdSet.has(track.id)),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.liked(), tracks =>
    tracks.filter(track => !trackIdSet.has(track.id)),
  );
  setQueryDataIfPresent<LikedTracksPageData>(
    queryClient,
    queryKeys.tracks.likedPage(),
    data => ({
      ...data,
      tracks: data.tracks.filter(track => !trackIdSet.has(track.id)),
    }),
  );
  const likedInfinite = queryClient.getQueryData<InfiniteData<PaginatedTracksResult>>(
    queryKeys.tracks.likedPageInfinite(),
  );
  if (likedInfinite) {
    // Durations come from the cached liked pages (only pages loaded so far); a liked
    // track deleted before its page was loaded contributes 0 here — see report.
    const removedLikedDuration = likedInfinite.pages
      .flatMap(page => page.tracks)
      .filter(track => trackIdSet.has(track.id))
      .reduce((sum, track) => sum + track.duration, 0);
    queryClient.setQueryData(
      queryKeys.tracks.likedPageInfinite(),
      removeTracksFromInfinitePages(likedInfinite, trackIdSet),
    );
    patchLikedTotalDuration(queryClient, -removedLikedDuration);
  }
  setQueriesDataIfPresent<PlaylistPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    },
    data => ({
      ...data,
      tracks: data.tracks.filter(track => !trackIdSet.has(track.id)),
    }),
  );
  setQueriesDataIfPresent<ArtistPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "artists" && query.queryKey[2] === "page",
    },
    data => ({
      ...data,
      tracks: data.tracks.filter(track => !trackIdSet.has(track.id)),
    }),
  );
  setQueriesDataIfPresent<AlbumPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "albums" && query.queryKey[2] === "page",
    },
    data => ({
      ...data,
      tracks: data.tracks.filter(track => !trackIdSet.has(track.id)),
    }),
  );
}

function patchStatsTrackCaches(
  queryClient: QueryClient,
  nextTrackEntity: TrackEntity,
  nextTrack: Track,
) {
  setQueriesDataIfPresent<{ track: Track }[]>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "stats"
        && (query.queryKey[1] === "topTracks" || query.queryKey[1] === "recentHistory"),
    },
    entries => entries.map(entry =>
      entry.track.id === nextTrack.id ? { ...entry, track: nextTrack } : entry,
    ),
  );

  setQueriesDataIfPresent<TrackEntity[]>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "stats" && query.queryKey[1] === "topTracksMeta",
    },
    tracks => tracks.map(track =>
      track.id === nextTrackEntity.id ? nextTrackEntity : track,
    ),
  );
}

export function syncTrackLikeCaches(
  queryClient: QueryClient,
  nextTrackEntity: TrackEntity,
  nextTrack: Track,
) {
  const likedAt = nextTrackEntity.likedAt;

  patchStatsTrackCaches(queryClient, nextTrackEntity, nextTrack);

  queryClient.setQueryData(queryKeys.tracks.detail(nextTrackEntity.id), nextTrackEntity);
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.all(), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? patchTrackEntityLike(track, likedAt) : track,
    ),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.albums.tracks(nextTrackEntity.albumId), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? patchTrackEntityLike(track, likedAt) : track,
    ),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.artists.tracks(nextTrackEntity.artistIds[0]), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? patchTrackEntityLike(track, likedAt) : track,
    ),
  );

  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.liked(), (tracks) => {
    const withoutCurrent = removeById(tracks, nextTrackEntity.id);

    if (!likedAt) {
      return withoutCurrent;
    }

    return sortLikedTracksDesc([nextTrackEntity, ...withoutCurrent]);
  });

  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      likedCount: Math.max(0, data.likedCount + (likedAt ? 1 : -1)),
    }),
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "tracks"
        && query.queryKey[1] === "liked"
        && query.queryKey[2] === "page"
        && query.queryKey[3] === "infinite",
    },
    data => patchInfiniteLikedPages(data, nextTrack),
  );

  patchLikedTotalDuration(
    queryClient,
    nextTrack.isLiked ? nextTrack.duration : -nextTrack.duration,
  );

  setQueryDataIfPresent<LikedTracksPageData>(
    queryClient,
    queryKeys.tracks.likedPage(),
    (data) => {
      const withoutCurrent = data.tracks.filter(track => track.id !== nextTrack.id);

      return {
        ...data,
        tracks: nextTrack.isLiked ? [nextTrack, ...withoutCurrent] : withoutCurrent,
      };
    },
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "playlists"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    (data) => {
      return mapInfiniteTrackPages(data, tracks =>
        tracks.map(track =>
          track.id === nextTrack.id ? nextTrack : track,
        ),
      );
    },
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "albums"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    (data) => {
      return mapInfiniteTrackPages(data, tracks =>
        tracks.map(track =>
          track.id === nextTrack.id ? nextTrack : track,
        ),
      );
    },
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "artists"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    (data) => {
      return mapInfiniteTrackPages(data, tracks =>
        tracks.map(track =>
          track.id === nextTrack.id ? nextTrack : track,
        ),
      );
    },
  );

  setQueriesDataIfPresent<PlaylistPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    },
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? patchTrackLike(track, nextTrack.isLiked) : track,
      ),
    }),
  );

  patchTracksIndexPages(queryClient, data => ({
    ...data,
    tracks: data.tracks.map(track =>
      track.id === nextTrack.id ? nextTrack : track,
    ),
  }));

  // The all-music page reads ["tracks","index","infinite",...] — without this
  // patch its rows keep a stale isLiked until refetch.
  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "tracks"
        && query.queryKey[1] === "index"
        && query.queryKey[2] === "infinite",
    },
    data => mapInfiniteTrackPages(data, tracks =>
      tracks.map(track => (track.id === nextTrack.id ? nextTrack : track)),
    ),
  );

  setQueryDataIfPresent<ArtistPageData>(
    queryClient,
    queryKeys.artists.page(nextTrack.artistIds[0]),
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? patchTrackLike(track, nextTrack.isLiked) : track,
      ),
    }),
  );

  setQueryDataIfPresent<AlbumPageData>(
    queryClient,
    queryKeys.albums.page(nextTrack.albumId),
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? patchTrackLike(track, nextTrack.isLiked) : track,
      ),
    }),
  );
}

export function syncTrackMetadataCaches(
  queryClient: QueryClient,
  nextTrackEntity: TrackEntity,
  nextTrack: Track,
) {
  queryClient.setQueryData(queryKeys.tracks.detail(nextTrackEntity.id), nextTrackEntity);

  patchStatsTrackCaches(queryClient, nextTrackEntity, nextTrack);

  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.all(), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? nextTrackEntity : track,
    ),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.tracks.liked(), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? nextTrackEntity : track,
    ),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.albums.tracks(nextTrackEntity.albumId), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? nextTrackEntity : track,
    ),
  );
  setQueryDataIfPresent<TrackEntity[]>(queryClient, queryKeys.artists.tracks(nextTrackEntity.artistIds[0]), tracks =>
    tracks.map(track =>
      track.id === nextTrackEntity.id ? nextTrackEntity : track,
    ),
  );

  setQueryDataIfPresent<LikedTracksPageData>(
    queryClient,
    queryKeys.tracks.likedPage(),
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    }),
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "tracks"
        && query.queryKey[1] === "liked"
        && query.queryKey[2] === "page"
        && query.queryKey[3] === "infinite",
    },
    data => mapInfiniteTrackPages(data, tracks =>
      tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    ),
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "playlists"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    data => mapInfiniteTrackPages(data, tracks =>
      tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    ),
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "albums"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    data => mapInfiniteTrackPages(data, tracks =>
      tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    ),
  );

  setQueriesDataIfPresent<InfiniteData<PaginatedTracksResult>>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "artists"
        && query.queryKey[2] === "tracks"
        && query.queryKey[3] === "page",
    },
    data => mapInfiniteTrackPages(data, tracks =>
      tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    ),
  );

  setQueriesDataIfPresent<PlaylistPageData>(
    queryClient,
    {
      predicate: query =>
        query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    },
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    }),
  );
  setQueryDataIfPresent<ArtistPageData>(
    queryClient,
    queryKeys.artists.page(nextTrack.artistIds[0]),
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    }),
  );
  setQueryDataIfPresent<AlbumPageData>(
    queryClient,
    queryKeys.albums.page(nextTrack.albumId),
    data => ({
      ...data,
      tracks: data.tracks.map(track =>
        track.id === nextTrack.id ? nextTrack : track,
      ),
    }),
  );
}

// ── Invalidation registry ─────────────────────────────────────────────────
// Each affected-key group is named once; invalidateFor*Mutation composes
// them per mutation kind.

type InvalidationFilter = Parameters<QueryClient["invalidateQueries"]>[0];

/** Таблица «сущность → фабрики затронутых ключей». */
const affectedKeys = {
  library: {
    summary: (): InvalidationFilter[] => [{ queryKey: queryKeys.library.summary() }],
  },
  tracks: {
    all: (): InvalidationFilter[] => [{ queryKey: queryKeys.tracks.all() }],
    /** Every page of the region-scoped tracks index (any sort / search). */
    indexPages: (): InvalidationFilter[] => [{
      predicate: query => query.queryKey[0] === "tracks" && query.queryKey[1] === "index",
    }],
    likedPage: (): InvalidationFilter[] => [{ queryKey: queryKeys.tracks.likedPage() }],
    likedPages: (): InvalidationFilter[] => [
      { queryKey: queryKeys.tracks.likedPage() },
      { queryKey: queryKeys.tracks.likedPageInfinite() },
    ],
    likedTotalDuration: (): InvalidationFilter[] => [
      { queryKey: queryKeys.tracks.likedTotalDuration() },
    ],
  },
  albums: {
    all: (): InvalidationFilter[] => [{ queryKey: queryKeys.albums.all() }],
    pages: (
      ids: readonly AlbumId[],
      opts: { totalDuration?: boolean } = {},
    ): InvalidationFilter[] =>
      ids.flatMap(id => [
        { queryKey: queryKeys.albums.page(id) },
        { queryKey: queryKeys.albums.tracksPage(id) },
        ...(opts.totalDuration ? [{ queryKey: queryKeys.albums.totalDuration(id) }] : []),
      ]),
    anyPage: (): InvalidationFilter[] => [{
      predicate: query => query.queryKey[0] === "albums" && query.queryKey[2] === "page",
    }],
  },
  artists: {
    all: (): InvalidationFilter[] => [{ queryKey: queryKeys.artists.all() }],
    pages: (ids: readonly ArtistId[]): InvalidationFilter[] =>
      ids.flatMap(id => [
        { queryKey: queryKeys.artists.page(id) },
        { queryKey: queryKeys.artists.tracksPage(id) },
      ]),
    albumsOf: (id: ArtistId): InvalidationFilter[] => [{ queryKey: queryKeys.artists.albums(id) }],
  },
  playlists: {
    all: (): InvalidationFilter[] => [{ queryKey: queryKeys.playlists.all() }],
    pages: (
      ids: readonly PlaylistId[],
      opts: { tracksPage?: boolean } = { tracksPage: true },
    ): InvalidationFilter[] =>
      ids.flatMap(id => [
        { queryKey: queryKeys.playlists.detail(id) },
        { queryKey: queryKeys.playlists.page(id) },
        ...(opts.tracksPage === false ? [] : [{ queryKey: queryKeys.playlists.tracksPage(id) }]),
        { queryKey: queryKeys.playlists.totalDuration(id) },
      ]),
    anyPage: (): InvalidationFilter[] => [{
      predicate: query => query.queryKey[0] === "playlists" && query.queryKey[2] === "page",
    }],
  },
} as const;

function runInvalidations(queryClient: QueryClient, filters: InvalidationFilter[]) {
  return Promise.all(filters.map(filter => queryClient.invalidateQueries(filter))).then(() => {});
}

export type TrackMutationCtx
  = | { kind: "relations" }
    | { kind: "metadata"; artistIds: readonly ArtistId[]; albumIds: readonly AlbumId[] }
    | {
      kind: "removal";
      albumIds: readonly AlbumId[];
      artistIds: readonly ArtistId[];
      playlistIds: readonly PlaylistId[];
    };

export function invalidateForTrackMutation(
  queryClient: QueryClient,
  ctx: TrackMutationCtx,
): Promise<void> {
  switch (ctx.kind) {
    case "relations":
      // add-to-album / add-to-artist / bulk favorite: every list may move.
      return runInvalidations(queryClient, [
        ...affectedKeys.library.summary(),
        ...affectedKeys.tracks.all(),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.albums.all(),
        ...affectedKeys.artists.all(),
        ...affectedKeys.playlists.all(),
      ]);
    case "metadata":
      return runInvalidations(queryClient, [
        ...affectedKeys.artists.pages(ctx.artistIds),
        ...affectedKeys.tracks.likedPages(),
        ...affectedKeys.albums.pages(ctx.albumIds, { totalDuration: true }),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.playlists.anyPage(),
      ]);
    case "removal":
      return runInvalidations(queryClient, [
        ...affectedKeys.library.summary(),
        // The albums/artists prefix filters above already match every per-id
        // key; a whole-library delete would otherwise scan the cache once per id.
        ...affectedKeys.albums.all(),
        ...affectedKeys.artists.all(),
        ...affectedKeys.playlists.pages(ctx.playlistIds),
        ...affectedKeys.tracks.indexPages(),
      ]);
  }
}

export type AlbumMutationCtx
  = | { kind: "titleChange" }
    | { kind: "removal"; artistId: ArtistId };

        // The point-patch above only reaches the default-sort liked page.
        ...affectedKeys.tracks.likedPages(),
        ...affectedKeys.tracks.likedTotalDuration(),
export function invalidateForAlbumMutation(
  queryClient: QueryClient,
  ctx: AlbumMutationCtx,
): Promise<void> {
  switch (ctx.kind) {
    case "titleChange":
      // Intentionally only likedPage — the point-sync already patched the rows.
      return runInvalidations(queryClient, [
        ...affectedKeys.tracks.likedPage(),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.playlists.anyPage(),
      ]);
    case "removal":
      return runInvalidations(queryClient, [
        ...affectedKeys.library.summary(),
        ...affectedKeys.tracks.all(),
        ...affectedKeys.tracks.likedPages(),
        ...affectedKeys.tracks.likedTotalDuration(),
        ...affectedKeys.artists.pages([ctx.artistId]),
        ...affectedKeys.artists.albumsOf(ctx.artistId),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.playlists.anyPage(),
      ]);
  }
}

export type ArtistMutationCtx
  = | { kind: "change"; artistId: ArtistId }
    | { kind: "removal"; albumIds: readonly AlbumId[] };

export function invalidateForArtistMutation(
  queryClient: QueryClient,
  ctx: ArtistMutationCtx,
): Promise<void> {
  switch (ctx.kind) {
    case "change":
      return runInvalidations(queryClient, [
        ...affectedKeys.artists.pages([ctx.artistId]),
        ...affectedKeys.tracks.likedPages(),
        ...affectedKeys.tracks.likedTotalDuration(),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.albums.anyPage(),
        ...affectedKeys.playlists.anyPage(),
      ]);
    case "removal":
      return runInvalidations(queryClient, [
        ...affectedKeys.library.summary(),
        ...affectedKeys.tracks.all(),
        ...affectedKeys.tracks.likedPages(),
        ...affectedKeys.tracks.likedTotalDuration(),
        ...affectedKeys.albums.pages(ctx.albumIds),
        ...affectedKeys.tracks.indexPages(),
        ...affectedKeys.playlists.anyPage(),
      ]);
  }
}

export type PlaylistMutationCtx
  = | { kind: "trackRemoval"; playlistId: PlaylistId }
    | { kind: "trackAddition"; playlistId: PlaylistId }
    | { kind: "bulkAddition"; playlistId: PlaylistId };

export function invalidateForPlaylistMutation(
  queryClient: QueryClient,
  ctx: PlaylistMutationCtx,
): Promise<void> {
  switch (ctx.kind) {
    case "trackRemoval":
      return runInvalidations(queryClient, affectedKeys.playlists.pages([ctx.playlistId]));
    case "trackAddition":
      // Intentionally skips tracksPage — the point-sync patches the row.
      return runInvalidations(
        queryClient,
        affectedKeys.playlists.pages([ctx.playlistId], { tracksPage: false }),
      );
    case "bulkAddition":
      return runInvalidations(queryClient, [
        ...affectedKeys.library.summary(),
        ...affectedKeys.playlists.all(),
        ...affectedKeys.playlists.pages([ctx.playlistId]),
      ]);
  }
}
