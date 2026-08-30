import { computed, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/vue-query";
import { PlaylistId } from "@/types/ids";
import { formatTotalDuration } from "@/lib/format/time";
import { useI18n } from "vue-i18n";
import { usePlaylistCover } from "@/modules/covers/composables/usePlaylistCover";
import { PlaylistData } from "@/modules/media-hero/types";
import { queryKeys } from "@/queries/query-keys";
import {
  deletePlaylistAndSync,
  getPlaylistPageData,
  getPlaylistTracksPaginated,
  playlistQueries,
  removeTrackFromPlaylistAndSync,
  type PlaylistChanges,
  updatePlaylistAndSync,
} from "@/queries/playlist.queries";
import { fetchSourcePlaylist } from "@/queries/source.queries";
import { routeLocation } from "@/app/router/route-locations";
import type { Track } from "@/modules/player/types";
import type { TrackSortKey } from "@/modules/tracks/types";
import { useSourcePlaylist, useSourcePlaylistPages } from "@/modules/sources/composables/useSourceCatalog";
import { useCatalogEntity } from "@/modules/sources/composables/useCatalogEntity";
import { pagedPlaylistKindOf } from "@/modules/sources/lib/catalog-kind";
import { sourcePlaylistToPlaylistData, sourceTrackToDisplay } from "@/modules/sources/lib/display";
import type { SourcePlaylistDTO } from "@/modules/sources/types";

export type { PlaylistChanges } from "@/queries/playlist.queries";

export function usePlaylistPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const playlistId = computed(() => PlaylistId(route.params.id as string));

  // Remote playlists route as "<kind>:<serverId>" — read-only live pages.
  // The provider takes the branded id and unwraps it itself, exactly like
  // getAlbum and getArtist. A pinned library row under the same id wins:
  // that one is a real playlist, not a catalog page.
  const path = useCatalogEntity("playlists", playlistId);
  const { remoteKind, isRemote, remoteId, localEnabled } = path;

  // A source that pages its playlists is browsed page by page; one that does
  // not hands the playlist over whole. Exactly one of the two queries runs —
  // the other parks on skipToken.
  const pagedKind = computed(() =>
    (remoteKind.value ? pagedPlaylistKindOf(playlistId.value) : null),
  );
  const isPaged = computed(() => pagedKind.value !== null);
  const wholeKind = computed(() => (isPaged.value ? null : remoteKind.value));

  const wholeQuery = useSourcePlaylist(wholeKind, computed(() => (isPaged.value ? null : remoteId.value)));
  const pagedQuery = useSourcePlaylistPages(pagedKind, remoteId);

  const remoteState = {
    isLoading: computed(() => (isPaged.value ? pagedQuery.isLoading.value : wholeQuery.isLoading.value)),
    isError: computed(() => (isPaged.value ? pagedQuery.isError.value : wholeQuery.isError.value)),
  };

  const {
    data: playlistData,
    isLoading: isLocalPlaylistLoading,
    isError: isLocalError,
    error,
    refetch,
  } = useQuery(computed(() => playlistQueries.detail(playlistId.value, localEnabled.value)));

  const { isError, isLoading: isPlaylistLoading } = path.pathState(remoteState, {
    isLoading: isLocalPlaylistLoading,
    isError: isLocalError,
  });

  const playlist = path.libraryRow(playlistData);

  const {
    data: infiniteData,
    fetchNextPage: fetchNextLocalPage,
    hasNextPage: hasNextLocalPage,
    isLoading: isLocalTracksLoading,
    isFetchingNextPage: isFetchingNextLocalPage,
  } = useInfiniteQuery({
    queryKey: computed(() => queryKeys.playlists.tracksPage(playlistId.value, sortKey.value)),
    queryFn: ({ pageParam = 0 }) => getPlaylistTracksPaginated(playlistId.value, pageParam, undefined, sortKey.value),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    placeholderData: previousData => previousData,
    enabled: computed(() => !isRemote.value && !!playlist.value),
  });

  const remoteDtos = computed(() =>
    (isPaged.value
      ? pagedQuery.data.value?.pages.flatMap(page => page.page.items) ?? []
      : wholeQuery.data.value?.tracks ?? []),
  );

  const remoteMeta = computed<SourcePlaylistDTO | null>(() =>
    (isPaged.value
      ? pagedQuery.data.value?.pages[0]?.playlist ?? null
      : wholeQuery.data.value?.playlist ?? null),
  );

  const remoteTracks = computed(() => remoteDtos.value.map(sourceTrackToDisplay));

  const tracks = computed(() =>
    isRemote.value
      ? remoteTracks.value
      : infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
  );

  const fetchNextPage = () =>
    (isPaged.value ? pagedQuery.fetchNextPage() : fetchNextLocalPage());
  const hasNextPage = computed(() =>
    (isPaged.value ? pagedQuery.hasNextPage.value : hasNextLocalPage.value),
  );
  const isFetchingNextPage = computed(() =>
    (isPaged.value ? pagedQuery.isFetchingNextPage.value : isFetchingNextLocalPage.value),
  );
  // On the whole-playlist path the tracks came with the playlist itself, so
  // there is no second load to wait on.
  const isTracksLoading = computed(() => {
    if (isPaged.value) return pagedQuery.isLoading.value;
    return isRemote.value ? false : isLocalTracksLoading.value;
  });

  /**
   * Sorting is a library feature: Dexie sorts by index across every page, so
   * the answer covers the whole list and costs nothing to produce. A catalog
   * list would have to be re-sorted in the browser over whatever has been
   * fetched — expensive on a long list and wrong on a paged one — so a remote
   * page keeps the order its source gave it. A playlist imported into the
   * library is a library playlist and sorts like one.
   */
  const canSort = computed(() => !isRemote.value);

  const trackCount = computed(() => {
    if (!isRemote.value) {
      return infiniteData.value?.pages[0]?.total ?? playlist.value?.trackIds.length ?? 0;
    }
    // While a cursor remains, the source's own count is the only estimate of
    // the whole; once it runs out the loaded rows ARE the playlist.
    if (isPaged.value && hasNextPage.value) {
      return remoteMeta.value?.trackCount ?? remoteTracks.value.length;
    }
    return remoteTracks.value.length;
  });

  const { data: playlistTotalDurationSeconds } = useQuery(
    computed(() => playlistQueries.totalDuration(playlistId.value, !isRemote.value)),
  );

  const totalDuration = computed(() =>
    formatTotalDuration(
      isRemote.value
        ? remoteTracks.value.reduce((sum, track) => sum + track.duration, 0)
        : playlistTotalDurationSeconds.value ?? 0,
      t,
    ),
  );

  const {
    url: coverUrl,
    isLoading: isCoverLoading,
  } = usePlaylistCover(playlistId);

  const isLoading = computed(() =>
    isPlaylistLoading.value || isCoverLoading.value || isTracksLoading.value,
  );

  const playlistDetailData = computed<PlaylistData | null>(() => {
    if (isRemote.value) {
      const remotePlaylist = remoteMeta.value;
      if (!remotePlaylist) return null;
      return {
        ...sourcePlaylistToPlaylistData(remotePlaylist, playlistId.value),
        trackCount: trackCount.value,
        duration: totalDuration.value,
      };
    }
    const current = playlist.value;
    if (!current) return null;

    return {
      type: "playlist",
      id: current.id,
      title: current.name,
      image: coverUrl.value ?? "",
      isOwner: true,
      trackCount: trackCount.value,
      duration: totalDuration.value,
      description: current.description,
    };
  });

  const loadAllTracks = async (): Promise<Track[]> => {
    const kind = pagedKind.value;
    if (kind) {
      const whole = await fetchSourcePlaylist(queryClient, kind, playlistId.value);
      return whole.tracks.map(sourceTrackToDisplay);
    }
    const current = playlist.value;
    if (!current) return [];
    return (await getPlaylistPageData(current.id, sortKey.value))?.tracks ?? [];
  };

  const { mutateAsync: deletePlaylist } = useMutation({
    mutationFn: (options: { deleteTracks?: boolean } = {}) =>
      deletePlaylistAndSync(queryClient, playlist.value, options),
    onSuccess: () => {
      router.push(routeLocation.home());
    },
  });

  const { mutateAsync: updatePlaylist } = useMutation({
    mutationFn: async (changes: PlaylistChanges) => {
      const current = playlist.value;
      if (!current) {
        return;
      }

      return updatePlaylistAndSync(queryClient, current, changes);
    },
  });

  const { mutateAsync: removeTrack } = useMutation({
    mutationFn: (trackId: string) =>
      removeTrackFromPlaylistAndSync(
        queryClient,
        playlistId.value,
        trackId,
      ),
  });

  return {
    playlist,
    tracks,
    canSort,
    /** True when `tracks` already holds the playlist whole. */
    isComplete: computed(() => !isPaged.value && isRemote.value),
    loadAllTracks,
    playlistData: playlistDetailData,
    coverUrl,
    trackCount,
    totalDuration,
    isLoading,
    isError,
    error,
    deletePlaylist,
    updatePlaylist,
    removeTrack,
    refetch,
    fetchNextPage,
    hasNextPage,
    isTracksLoading,
    isFetchingNextPage,
  };
}
