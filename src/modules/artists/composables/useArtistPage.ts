import { computed, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/vue-query";
import { ArtistId } from "@/types/ids";
import { ArtistData } from "@/modules/media-hero/types";
import { queryKeys } from "@/queries/query-keys";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import {
  artistQueries,
  deleteArtistAndSync,
  getArtistAlbumsPaginated,
  getArtistTracksPaginated,
  type ArtistChanges,
  updateArtistAndSync,
} from "@/queries/artist.queries";
import { statsQueries } from "@/queries/stats.queries";
import { routeLocation } from "@/app/router/route-locations";
import type { TrackSortKey } from "@/modules/tracks/types";
import { useSourceArtist } from "@/modules/sources/composables/useSourceCatalog";
import { useRemoteCatalogKind } from "@/modules/sources/composables/useRemoteCatalogKind";
import { sourceArtistToArtistData, sourceCoverUrl, sourceTrackToDisplay, THUMB_SIZE_CARD } from "@/modules/sources/lib/display";
import type { SourceAlbumDTO } from "@/modules/sources/types";
import type { AlbumEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";

export type { ArtistChanges } from "@/queries/artist.queries";

/** Entity-shaped view of a remote album so the page's album cards keep working. */
function sourceAlbumToLibraryAlbum(dto: SourceAlbumDTO): AlbumEntity {
  return {
    id: dto.id,
    title: dto.title,
    artistId: dto.artistId ?? ArtistId(""),
    year: dto.year,
    pinned: 0,
    addedAt: 0,
    updatedAt: 0,
  };
}

export function useArtistPage(sortKey: Ref<TrackSortKey | null>) {
  const route = useRoute();
  const router = useRouter();
  const queryClient = useQueryClient();

  const artistId = computed(() => ArtistId(route.params.id as string));

  // Data path picks by id AND by whether a pinned library row exists under
  // it: a downloaded remote artist is a library entity, not a catalog one.
  const { remoteKind, isResolved } = useRemoteCatalogKind("artists", artistId);
  const isRemote = computed(() => remoteKind.value !== null);

  const remoteQuery = useSourceArtist(remoteKind, computed(() => (isRemote.value ? artistId.value : null)));

  const {
    data: artistData,
    isLoading: isLocalArtistLoading,
    isError: isLocalError,
    error,
    refetch,
  } = useQuery(computed(() => artistQueries.detail(artistId.value, isResolved.value && !isRemote.value)));

  const isError = computed(() => (isRemote.value ? remoteQuery.isError.value : isLocalError.value));
  const isArtistLoading = computed(() =>
    (!isResolved.value || (isRemote.value ? remoteQuery.isLoading.value : isLocalArtistLoading.value)),
  );

  // `enabled: false` stops the fetch, not the cache read: a query whose key
  // was filled by an earlier library visit still hands its row back here.
  // The catalog view must not see it — that row is what makes the page call
  // itself a library entity, down to the context menu on its album cards.
  const artist = computed(() => (isRemote.value ? null : artistData.value ?? null));

  const {
    data: tracksInfiniteData,
    fetchNextPage: fetchNextTrackPage,
    hasNextPage: hasNextTrackPage,
    isLoading: isTracksLoading,
    isFetchingNextPage: isFetchingNextTrackPage,
  } = useInfiniteQuery({
    queryKey: computed(() => queryKeys.artists.tracksPage(artistId.value, sortKey.value)),
    queryFn: ({ pageParam = 0 }) => getArtistTracksPaginated(artistId.value, pageParam, undefined, sortKey.value),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    placeholderData: previousData => previousData,
    enabled: computed(() => !isRemote.value && !!artist.value),
  });

  // A catalog artist has no Dexie rows to page through; its top tracks ride
  // along with getArtist. Sources without such a notion omit the field, and
  // the section is simply empty for them.
  const tracks = computed(() =>
    (isRemote.value
      ? (remoteQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay)
      : tracksInfiniteData.value?.pages.flatMap(page => page.tracks) ?? []),
  );

  const {
    data: albumsInfiniteData,
    fetchNextPage: fetchNextAlbumPage,
    hasNextPage: hasNextAlbumPage,
    isFetchingNextPage: isFetchingNextAlbumPage,
  } = useInfiniteQuery({
    queryKey: computed(() => queryKeys.artists.albums(artistId.value)),
    queryFn: ({ pageParam = 0 }) => getArtistAlbumsPaginated(artistId.value, pageParam),
    initialPageParam: 0,
    getNextPageParam: lastPage => lastPage.nextOffset,
    enabled: computed(() => !isRemote.value && !!artist.value),
  });

  const remoteAlbums = computed(() => remoteQuery.data.value?.albums ?? []);

  // Entity-shaped album rows drop coverRef — proxy the URLs separately.
  const albumCovers = computed(() => new Map(
    remoteAlbums.value
      .filter(album => album.coverRef)
      .map(album => [
        album.id,
        sourceCoverUrl(remoteKind.value ?? "local", album.coverRef, THUMB_SIZE_CARD),
      ] as const),
  ));

  const albums = computed(() =>
    isRemote.value
      ? remoteAlbums.value.map(sourceAlbumToLibraryAlbum)
      : albumsInfiniteData.value?.pages.flatMap(page => page.albums) ?? [],
  );

  // A shelf only catalog artists have: sources that carry no artist
  // playlists omit the field and the section never renders.
  const playlistItems = computed<LibraryItem[]>(() =>
    (remoteQuery.data.value?.playlists ?? []).map(playlist => ({
      id: playlist.id,
      type: "playlist",
      title: playlist.name,
      image: sourceCoverUrl(remoteKind.value ?? "local", playlist.coverRef, THUMB_SIZE_CARD) || undefined,
      isPinned: false,
      isCatalog: true,
      addedAt: 0,
      updatedAt: 0,
      to: routeLocation.playlist(playlist.id, { catalog: true }),
      rounded: false,
      trackCount: playlist.trackCount,
    })),
  );

  const trackCount = computed(
    () => (isRemote.value ? 0 : tracksInfiniteData.value?.pages[0]?.total ?? 0),
  );

  const albumCount = computed(() =>
    isRemote.value
      ? remoteQuery.data.value?.artist.albumCount ?? remoteAlbums.value.length
      : albumsInfiniteData.value?.pages[0]?.total ?? 0,
  );

  const {
    url: coverUrl,
    isLoading: isCoverLoading,
  } = useEntityCover("artist", artistId);

  const { data: playsCount } = useQuery(
    computed(() => statsQueries.artistPlays(artistId.value)),
  );

  const isLoading = computed(
    () => isArtistLoading.value || isCoverLoading.value || isTracksLoading.value,
  );

  const artistDataMapped = computed<ArtistData | null>(() => {
    if (isRemote.value) {
      const remoteArtist = remoteQuery.data.value?.artist;
      return remoteArtist ? sourceArtistToArtistData(remoteArtist) : null;
    }
    if (!artist.value) return null;

    return {
      type: "artist",
      id: artist.value.id,
      title: artist.value.name,
      image: coverUrl.value ?? "",
      monthlyListeners: playsCount.value ?? 0,
      isFollowing: false,
      bio: artist.value.bio,
    };
  });

  const { mutateAsync: deleteArtist } = useMutation({
    mutationFn: (options: { deleteTracks?: boolean } = {}) =>
      deleteArtistAndSync(queryClient, artistData.value ?? null, options),
    onSuccess: () => {
      router.push(routeLocation.home());
    },
  });

  const { mutateAsync: updateArtist } = useMutation({
    mutationFn: async (changes: ArtistChanges) => {
      const current = artist.value;
      if (!current) {
        return;
      }

      return updateArtistAndSync(queryClient, current, changes);
    },
  });

  return {
    artist,
    albums,
    albumCovers,
    playlistItems,
    tracks,
    artistData: artistDataMapped,
    coverUrl,
    trackCount,
    albumCount,
    isLoading,
    isError,
    error,
    deleteArtist,
    updateArtist,
    refetch,
    fetchNextTrackPage,
    hasNextTrackPage,
    isTracksLoading,
    isFetchingNextTrackPage,
    fetchNextAlbumPage,
    hasNextAlbumPage,
    isFetchingNextAlbumPage,
  };
}
