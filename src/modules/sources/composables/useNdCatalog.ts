import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { ND_STALE_TIME, ndQueries } from "@/queries/nd.queries";
import { queryKeys } from "@/queries/query-keys";
import { unwrapSourceResult } from "@/queries/shared";
import type { AlbumId, ArtistId } from "@/types/ids";
import { sources } from "../registry";
import { getNdConfig } from "../navidrome/config";

//
// ND catalog composables — the second data leg next to the Dexie-backed
// queries. Availability is reactive over the source settings; while the
// source is off every query sits on skipToken.
//

export type NdAlbumSort = "alpha" | "newest";

/** getAlbumList2 page size (contract cap is 500). */
const ALBUMS_PAGE_SIZE = 100;

/** Reactive availability of the configured Navidrome source. */
export function useNdAvailable() {
  return computed(() => getNdConfig() !== null);
}

export function useNdArtists() {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.artists(available.value)));
}

export function useNdAlbum(id: MaybeRefOrGetter<AlbumId | null>) {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.album(available.value ? toValue(id) : null)));
}

export function useNdArtist(id: MaybeRefOrGetter<ArtistId | null>) {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.artist(available.value ? toValue(id) : null)));
}

export function useNdPlaylists() {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.playlists(available.value)));
}

export function useNdPlaylist(id: MaybeRefOrGetter<string | null>) {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.playlist(available.value ? toValue(id) : null)));
}

export function useNdSearch(
  q: MaybeRefOrGetter<string>,
  types: ("track" | "album" | "artist")[] = ["track", "album", "artist"],
  limit = 20,
) {
  const available = useNdAvailable();
  return useQuery(computed(() => ndQueries.search(available.value ? toValue(q) : "", types, limit)));
}

/** Infinite album feed — the offset-paged getAlbumList2 one-to-one. */
export function useNdAlbumsInfinite(sort: MaybeRefOrGetter<NdAlbumSort>) {
  const available = useNdAvailable();

  return useInfiniteQuery(computed(() => ({
    queryKey: queryKeys.nd.albumsInf(toValue(sort)),
    staleTime: ND_STALE_TIME,
    initialPageParam: 0,
    queryFn: available.value
      ? ({ pageParam }: { pageParam: number }) =>
          unwrapSourceResult(sources.get("nd").listAlbums({
            offset: pageParam,
            limit: ALBUMS_PAGE_SIZE,
            sort: toValue(sort),
          }))
      : skipToken,
    getNextPageParam: (lastPage: unknown[], pages: unknown[][]) =>
      lastPage.length < ALBUMS_PAGE_SIZE ? undefined : pages.length * ALBUMS_PAGE_SIZE,
  })));
}
