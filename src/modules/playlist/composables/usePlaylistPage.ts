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
  getPlaylistTracksPaginated,
  playlistQueries,
  removeTrackFromPlaylistAndSync,
  type PlaylistChanges,
  updatePlaylistAndSync,
} from "@/queries/playlist.queries";
import { routeLocation } from "@/app/router/route-locations";
import type { TrackSortKey } from "@/modules/tracks/types";
import { sortDisplayTracks } from "@/modules/tracks/lib/sortDisplayTracks";
import { remoteCatalogKindOf, useSourcePlaylist } from "@/modules/sources/composables/useSourceCatalog";
import { sourcePlaylistToPlaylistData, sourceTrackToDisplay } from "@/modules/sources/lib/display";

export type { PlaylistChanges } from "@/queries/playlist.queries";

export function usePlaylistPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const playlistId = computed(() => PlaylistId(route.params.id as string));

  // Remote playlists route as "<kind>:<serverId>" — read-only live pages.
  const remoteKind = computed(() => remoteCatalogKindOf(playlistId.value, "playlists"));
  const isRemote = computed(() => remoteKind.value !== null);
  const remotePlaylistId = computed(() => {
    const kind = remoteKind.value;
    return kind ? playlistId.value.slice(`${kind}:`.length) : null;
  });

  const remoteQuery = useSourcePlaylist(remoteKind, remotePlaylistId);

  const {
    data: playlistData,
    isLoading: isLocalPlaylistLoading,
    isError: isLocalError,
    error,
    refetch,
  } = useQuery(computed(() => playlistQueries.detail(playlistId.value, !isRemote.value)));

  const isError = computed(() => (isRemote.value ? remoteQuery.isError.value : isLocalError.value));
  const isPlaylistLoading = computed(() => (isRemote.value ? remoteQuery.isLoading.value : isLocalPlaylistLoading.value));

  const playlist = computed(() => playlistData.value ?? null);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isLoading: isTracksLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: computed(() => queryKeys.playlists.tracksPage(playlistId.value, sortKey.value)),
    queryFn: ({ pageParam = 0 }) => getPlaylistTracksPaginated(playlistId.value, pageParam, undefined, sortKey.value),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    placeholderData: previousData => previousData,
    enabled: computed(() => !isRemote.value && !!playlist.value),
  });

  const remoteTracks = computed(() => {
    const mapped = (remoteQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay);
    return sortKey.value ? sortDisplayTracks(mapped, sortKey.value) : mapped;
  });

  const tracks = computed(() =>
    isRemote.value
      ? remoteTracks.value
      : infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
  );

  const trackCount = computed(() =>
    isRemote.value
      ? remoteTracks.value.length
      : infiniteData.value?.pages[0]?.total ?? playlist.value?.trackIds.length ?? 0,
  );

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
      const remotePlaylist = remoteQuery.data.value?.playlist;
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
