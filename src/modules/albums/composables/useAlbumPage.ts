import { computed, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery, skipToken } from "@tanstack/vue-query";
import { AlbumId } from "@/types/ids";
import type { AlbumData } from "@/modules/media-hero/types";
import { stableObjectUrl } from "@/modules/covers/lib/stable-object-url";
import { queryKeys } from "@/queries/query-keys";
import { formatTotalDuration } from "@/lib/format/time";
import { useI18n } from "vue-i18n";
import {
  albumQueries,
  deleteAlbumAndSync,
  getAlbumTracksPaginated,
  type AlbumChanges,
  updateAlbumAndSync,
} from "@/queries/album.queries";
import { coverQueries } from "@/queries/cover.queries";
import { getArtistByIdOrThrow } from "@/queries/artist.queries";
import { routeLocation } from "@/app/router/route-locations";
import type { TrackSortKey } from "@/modules/tracks/types";
import { useNdAlbum } from "@/modules/sources/composables/useNdCatalog";
import { sourceAlbumToAlbumData, sourceKindOf, sourceTrackToDisplay } from "@/modules/sources/lib/display";

export type { AlbumChanges } from "@/queries/album.queries";

export function useAlbumPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const albumId = computed(() => AlbumId(route.params.id as string));

  // Data path picks by id prefix: nd: albums come live from the source,
  // everything below the VMs stays shared (no template branching).
  const isNd = computed(() => sourceKindOf(albumId.value) === "nd");

  const ndQuery = useNdAlbum(computed(() => (isNd.value ? albumId.value : null)));

  const {
    data: albumData,
    isLoading: isLocalAlbumLoading,
    isError: isLocalError,
    error,
    refetch,
  } = useQuery(computed(() => ({
    ...albumQueries.detail(albumId.value),
    enabled: !isNd.value,
  }) as ReturnType<typeof albumQueries.detail> & { enabled: boolean }));

  const isError = computed(() => (isNd.value ? ndQuery.isError.value : isLocalError.value));
  const isAlbumLoading = computed(() => (isNd.value ? ndQuery.isLoading.value : isLocalAlbumLoading.value));

  const album = computed(() => albumData.value ?? null);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isLoading: isTracksLoading,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: computed(() => queryKeys.albums.tracksPage(albumId.value, sortKey.value)),
    queryFn: ({ pageParam = 0 }) => getAlbumTracksPaginated(albumId.value, pageParam, undefined, sortKey.value),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    placeholderData: previousData => previousData,
    enabled: computed(() => !isNd.value && !!album.value),
  });

  const ndTracks = computed(() => (ndQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay));

  const tracks = computed(() =>
    isNd.value
      ? ndTracks.value
      : infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
  );

  const trackCount = computed(() =>
    isNd.value
      ? ndTracks.value.length
      : infiniteData.value?.pages[0]?.total ?? 0,
  );

  const { data: albumTotalDurationSeconds } = useQuery(
    computed(() => ({
      ...albumQueries.totalDuration(albumId.value),
      enabled: !isNd.value,
    }) as ReturnType<typeof albumQueries.totalDuration> & { enabled: boolean }),
  );

  const totalDuration = computed(() =>
    formatTotalDuration(
      isNd.value
        ? ndTracks.value.reduce((sum, track) => sum + track.duration, 0)
        : albumTotalDurationSeconds.value ?? 0,
      t,
    ),
  );

  const artistId = computed(() => album.value?.artistId);

  const { data: artistData } = useQuery({
    queryKey: computed(() => queryKeys.artists.detail(artistId.value!)),
    queryFn: computed(() =>
      artistId.value
        ? () => getArtistByIdOrThrow(artistId.value!)
        : skipToken,
    ),
  });

  const artist = computed(() =>
    artistData.value ? { id: artistData.value.id, name: artistData.value.name } : null,
  );

  const {
    data: coverBlob,
    isLoading: isCoverLoading,
  } = useQuery(computed(() => ({
    ...coverQueries.detail("album", albumId.value),
    enabled: !isNd.value,
  }) as ReturnType<typeof coverQueries.detail> & { enabled: boolean }));

  // Stable across remounts (unlike useObjectUrl) so the hero cover doesn't
  // replay its load animation on every navigation back to the page.
  const coverUrl = computed(() => {
    const blob = coverBlob.value;
    if (!blob || !albumId.value) return undefined;
    return stableObjectUrl(`album:${albumId.value}`, blob);
  });

  const isLoading = computed(() =>
    isAlbumLoading.value || isCoverLoading.value || isTracksLoading.value,
  );

  const albumDataMapped = computed<AlbumData | null>(() => {
    if (isNd.value) {
      const ndAlbum = ndQuery.data.value?.album;
      return ndAlbum ? sourceAlbumToAlbumData(ndAlbum, totalDuration.value) : null;
    }
    if (!album.value) return null;

    return {
      type: "album",
      id: album.value.id,
      title: album.value.title,
      artistName: artist.value?.name ?? "",
      artistId: album.value.artistId,
      image: coverUrl.value ?? "",
      releaseYear: album.value.year ?? 0,
      trackCount: trackCount.value,
      duration: totalDuration.value,
    };
  });

  const { mutateAsync: deleteAlbum } = useMutation({
    mutationFn: () => deleteAlbumAndSync(queryClient, albumData.value ?? null),
    onSuccess: () => {
      router.push(routeLocation.home());
    },
  });

  const { mutateAsync: updateAlbum } = useMutation({
    mutationFn: async (changes: AlbumChanges) => {
      const current = album.value;
      if (!current) {
        return;
      }

      return updateAlbumAndSync(queryClient, current, changes);
    },
  });

  return {
    album,
    tracks,
    albumData: albumDataMapped,
    coverUrl,
    trackCount,
    isLoading,
    isError,
    error,
    deleteAlbum,
    updateAlbum,
    refetch,
    fetchNextPage,
    hasNextPage,
    isTracksLoading,
    isFetchingNextPage,
  };
}
