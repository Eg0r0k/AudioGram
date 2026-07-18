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
      artists: upsertById(data.artists, artist as ArtistWithTrackCount),
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
      albums: upsertById(data.albums, album as AlbumWithTrackCount),
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
  queryClient: QueryClient,
  ownerType: CoverOwnerType,
  ownerId: string,
  blob: Blob | null,
) {
  queryClient.setQueryData(queryKeys.covers.detail(ownerType, ownerId), blob);
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
  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      likedTracks: data.likedTracks.filter(track => !trackIdSet.has(track.id)),
    }),
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

export function syncTrackLikeCaches(
  queryClient: QueryClient,
  nextTrackEntity: TrackEntity,
  nextTrack: Track,
) {
  const likedAt = nextTrackEntity.likedAt;

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
    (data) => {
      const withoutCurrent = removeById(data.likedTracks, nextTrackEntity.id);

      return {
        ...data,
        likedTracks: likedAt
          ? sortLikedTracksDesc([nextTrackEntity, ...withoutCurrent])
          : withoutCurrent,
      };
    },
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

  setQueryDataIfPresent<LibrarySummaryData>(
    queryClient,
    queryKeys.library.summary(),
    data => ({
      ...data,
      likedTracks: data.likedTracks.map(track =>
        track.id === nextTrackEntity.id ? nextTrackEntity : track,
      ),
    }),
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
