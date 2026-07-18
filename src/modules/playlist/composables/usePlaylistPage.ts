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

export type { PlaylistChanges } from "@/queries/playlist.queries";

export function usePlaylistPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const playlistId = computed(() => PlaylistId(route.params.id as string));

  const {
    data: playlistData,
    isLoading: isPlaylistLoading,
    isError,
    error,
    refetch,
  } = useQuery(computed(() => playlistQueries.detail(playlistId.value)));

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
    enabled: computed(() => !!playlist.value),
  });

  const tracks = computed(() =>
    infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
  );

  const trackCount = computed(
    () => infiniteData.value?.pages[0]?.total ?? playlist.value?.trackIds.length ?? 0,
  );

  const { data: playlistTotalDurationSeconds } = useQuery(
    computed(() => playlistQueries.totalDuration(playlistId.value)),
  );

  const totalDuration = computed(() =>
    formatTotalDuration(playlistTotalDurationSeconds.value ?? 0, t),
  );

  const {
    url: coverUrl,
    isLoading: isCoverLoading,
  } = usePlaylistCover(playlistId);

  const isLoading = computed(() =>
    isPlaylistLoading.value || isCoverLoading.value || isTracksLoading.value,
  );

  const playlistDetailData = computed<PlaylistData | null>(() => {
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
    mutationFn: () => deletePlaylistAndSync(queryClient, playlist.value),
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
