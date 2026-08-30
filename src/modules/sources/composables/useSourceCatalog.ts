import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { SOURCE_STALE_TIME, sourceQueries } from "@/queries/source.queries";
import { queryKeys } from "@/queries/query-keys";
import { unwrapSourceResult } from "@/queries/shared";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import type { SourceKind } from "@/types/track-ref";
import type { SourcePage, SourcePlaylistDTO, SourceTrackDTO } from "@/types/source-dto";
import type { SourceSearchHit, SourceSearchScope } from "../types";
import { sources } from "../registry";

// Remote-source catalog composables, parameterized by source kind. While
// the source is off (or the kind is null) every query sits on skipToken.

export type SourceAlbumSort = "alpha" | "newest";

type KindInput = MaybeRefOrGetter<SourceKind | null>;

/** getAlbumList2 page size (contract cap is 500). */
const ALBUMS_PAGE_SIZE = 100;

/** Reactive availability of a remote source (platform + settings gate). */
export function useSourceAvailable(kind: KindInput) {
  return computed(() => {
    const resolved = toValue(kind);
    return resolved !== null && sources.get(resolved).isAvailable;
  });
}

export function useSourceArtists(kind: KindInput) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() => sourceQueries(toValue(kind)).artists(available.value)));
}

export function useSourceAlbum(kind: KindInput, id: MaybeRefOrGetter<AlbumId | null>) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).album(available.value ? toValue(id) : null)));
}

export function useSourceArtist(kind: KindInput, id: MaybeRefOrGetter<ArtistId | null>) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).artist(available.value ? toValue(id) : null)));
}

export function useSourcePlaylists(kind: KindInput) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() => sourceQueries(toValue(kind)).playlists(available.value)));
}

export function useSourcePlaylist(kind: KindInput, id: MaybeRefOrGetter<PlaylistId | null>) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).playlist(available.value ? toValue(id) : null)));
}

/** Playlist metadata alone — the cheapest naming call a source can answer. */
export function useSourcePlaylistMeta(kind: KindInput, id: MaybeRefOrGetter<PlaylistId | null>) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).playlistMeta(available.value ? toValue(id) : null)));
}

type PlaylistPageResult = { playlist: SourcePlaylistDTO | null; page: SourcePage<SourceTrackDTO> };

/**
 * A playlist walked cursor by cursor, for sources that hand theirs over in
 * pages. The first page carries the metadata; later ones only tracks. Parked
 * on skipToken for a source without {@link SourceProvider.getPlaylistPage},
 * so a caller can hold this alongside {@link useSourcePlaylist} and let the
 * kind decide which one runs.
 */
export function useSourcePlaylistPages(kind: KindInput, id: MaybeRefOrGetter<PlaylistId | null>) {
  const available = useSourceAvailable(kind);

  return useInfiniteQuery(computed(() => {
    const resolved = toValue(kind);
    const playlistId = toValue(id);
    // Bound, not plucked: a provider may implement this against its own state.
    const provider = resolved && available.value ? sources.get(resolved) : null;
    const fetchPage = provider?.getPlaylistPage?.bind(provider);

    return {
      queryKey: queryKeys.source.playlistPages(resolved, playlistId),
      staleTime: SOURCE_STALE_TIME,
      initialPageParam: null as string | null,
      queryFn: fetchPage && playlistId
        ? ({ pageParam }: { pageParam: string | null }) =>
            unwrapSourceResult(fetchPage(playlistId, pageParam), resolved ?? undefined)
        : skipToken,
      getNextPageParam: (lastPage: PlaylistPageResult) => lastPage.page.cursor ?? undefined,
    };
  }));
}

/**
 * A search walked page by page, for sources that hand results over by
 * continuation. Parked on skipToken for a source without
 * {@link SourceProvider.searchPage} — a pane may hold this next to
 * {@link useSourceSearch} and let the kind decide which one runs.
 */
export function useSourceSearchPages(
  kind: KindInput,
  q: MaybeRefOrGetter<string>,
  scope: MaybeRefOrGetter<SourceSearchScope>,
) {
  const available = useSourceAvailable(kind);

  return useInfiniteQuery(computed(() => {
    const resolved = toValue(kind);
    const query = toValue(q).trim();
    const wanted = toValue(scope);
    // Bound, not plucked: a provider may implement this against its own state.
    const provider = resolved && available.value ? sources.get(resolved) : null;
    const fetchPage = provider?.searchPage?.bind(provider);

    return {
      queryKey: queryKeys.source.searchPages(resolved, wanted, query),
      staleTime: SOURCE_STALE_TIME,
      initialPageParam: null as string | null,
      queryFn: fetchPage && query
        ? ({ pageParam }: { pageParam: string | null }) =>
            unwrapSourceResult(fetchPage(query, wanted, pageParam), resolved ?? undefined)
        : skipToken,
      getNextPageParam: (lastPage: SourcePage<SourceSearchHit>) => lastPage.cursor ?? undefined,
    };
  }));
}

export function useSourceSearch(
  kind: KindInput,
  q: MaybeRefOrGetter<string>,
  types: ("track" | "album" | "artist")[] = ["track", "album", "artist"],
  limit = 20,
) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).search(available.value ? toValue(q) : "", types, limit)));
}

/** Infinite album feed — the offset-paged getAlbumList2 one-to-one. */
export function useSourceAlbumsInfinite(kind: KindInput, sort: MaybeRefOrGetter<SourceAlbumSort>) {
  const available = useSourceAvailable(kind);

  return useInfiniteQuery(computed(() => {
    const resolved = toValue(kind);
    return {
      queryKey: queryKeys.source.albumsInf(resolved, toValue(sort)),
      staleTime: SOURCE_STALE_TIME,
      initialPageParam: 0,
      queryFn: resolved && available.value
        ? ({ pageParam }: { pageParam: number }) =>
            unwrapSourceResult(sources.get(resolved).listAlbums({
              offset: pageParam,
              limit: ALBUMS_PAGE_SIZE,
              sort: toValue(sort),
            }), resolved)
        : skipToken,
      getNextPageParam: (lastPage: unknown[], pages: unknown[][]) =>
        lastPage.length < ALBUMS_PAGE_SIZE ? undefined : pages.length * ALBUMS_PAGE_SIZE,
    };
  }));
}
