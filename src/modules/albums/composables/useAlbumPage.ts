import { computed, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery, skipToken } from "@tanstack/vue-query";
import { AlbumId } from "@/types/ids";
import type { AlbumData } from "@/modules/media-hero/types";
import { queryKeys } from "@/queries/query-keys";
import { formatTotalDuration } from "@/lib/format/time";
import { getLogger } from "@/lib/logger";
import { useI18n } from "vue-i18n";
import {
  albumQueries,
  deleteAlbumAndSync,
  getAlbumTracksPaginated,
  type AlbumChanges,
  updateAlbumAndSync,
} from "@/queries/album.queries";
import { getArtistByIdOrThrow } from "@/queries/artist.queries";
import { routeLocation } from "@/app/router/route-locations";
import type { TrackSortKey } from "@/modules/tracks/types";
import { useSourceAlbum } from "@/modules/sources/composables/useSourceCatalog";
import { useCatalogEntity } from "@/modules/sources/composables/useCatalogEntity";
import { sourceAlbumToAlbumData, sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";

export type { AlbumChanges } from "@/queries/album.queries";

export function useAlbumPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const albumId = computed(() => AlbumId(route.params.id as string));

  const path = useCatalogEntity("albums", albumId);
  const { isRemote, remoteId, localEnabled } = path;

  const remoteQuery = useSourceAlbum(path.remoteKind, remoteId);

  const {
    data: albumData,
    isLoading: isLocalAlbumLoading,
    isError: isLocalError,
    error,
    refetch,
  } = useQuery(computed(() => albumQueries.detail(albumId.value, localEnabled.value)));

  const { isError, isLoading: isAlbumLoading } = path.pathState(remoteQuery, {
    isLoading: isLocalAlbumLoading,
    isError: isLocalError,
  });

  const album = path.libraryRow(albumData);

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
    enabled: computed(() => !isRemote.value && !!album.value),
  });

  const remoteTracks = computed(() =>
    (remoteQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay),
  );

  /**
   * Sorting is a library feature: Dexie sorts by index across every page. A
   * catalog album would have to be re-sorted in the browser, so it keeps the
   * order its source gave it — which for an album is the track order anyway.
   */
  const canSort = computed(() => !isRemote.value);

  const tracks = computed(() =>
    isRemote.value
      ? remoteTracks.value
      : infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
  );

  const trackCount = computed(() =>
    isRemote.value
      ? remoteTracks.value.length
      : infiniteData.value?.pages[0]?.total ?? 0,
  );

  const { data: albumTotalDurationSeconds } = useQuery(
    computed(() => albumQueries.totalDuration(albumId.value, !isRemote.value)),
  );

  const totalDuration = computed(() =>
    formatTotalDuration(
      isRemote.value
        ? remoteTracks.value.reduce((sum, track) => sum + track.duration, 0)
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

  // Remote albums show their source's art; only a library album has a
  // Dexie cover to look up.
  const { url: coverUrl, isLoading: isCoverLoading } = useEntityCover(
    () => (isRemote.value ? null : "album"),
    albumId,
  );

  const isLoading = computed(() =>
    isAlbumLoading.value || isCoverLoading.value || isTracksLoading.value,
  );

  const albumDataMapped = computed<AlbumData | null>(() => {
    if (isRemote.value) {
      const remoteAlbum = remoteQuery.data.value?.album;
      return remoteAlbum ? sourceAlbumToAlbumData(remoteAlbum, totalDuration.value) : null;
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
    mutationFn: (options: { deleteTracks?: boolean } = {}) =>
      deleteAlbumAndSync(queryClient, albumData.value ?? null, options),
    onSuccess: () => {
      router.push(routeLocation.home())
        .catch(error => getLogger().error(`[Album] Navigation home after delete failed: ${String(error)}`));
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
    canSort,
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
