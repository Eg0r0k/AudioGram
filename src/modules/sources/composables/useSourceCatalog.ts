import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { skipToken, useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { SOURCE_STALE_TIME, sourceQueries } from "@/queries/source.queries";
import { queryKeys } from "@/queries/query-keys";
import { unwrapSourceResult } from "@/queries/shared";
import type { AlbumId, ArtistId } from "@/types/ids";
import type { SourceKind } from "@/types/track-ref";
import { sourceKindOf } from "../lib/display";
import { sources } from "../registry";
import type { SourceCapabilities } from "../types";

// Remote-source catalog composables, parameterized by source kind. While
// the source is off (or the kind is null) every query sits on skipToken.

export type SourceAlbumSort = "alpha" | "newest";

type KindInput = MaybeRefOrGetter<SourceKind | null>;

/** getAlbumList2 page size (contract cap is 500). */
const ALBUMS_PAGE_SIZE = 100;

/**
 * The remote source behind an entity id when it can serve the given catalog
 * area; null → the local Dexie path.
 */
export function remoteCatalogKindOf(
  id: string,
  capability: keyof SourceCapabilities,
): SourceKind | null {
  const kind = sourceKindOf(id);
  if (kind === "local") return null;
  return sources.get(kind).capabilities[capability] ? kind : null;
}

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

export function useSourcePlaylist(kind: KindInput, id: MaybeRefOrGetter<string | null>) {
  const available = useSourceAvailable(kind);
  return useQuery(computed(() =>
    sourceQueries(toValue(kind)).playlist(available.value ? toValue(id) : null)));
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
            }))
        : skipToken,
      getNextPageParam: (lastPage: unknown[], pages: unknown[][]) =>
        lastPage.length < ALBUMS_PAGE_SIZE ? undefined : pages.length * ALBUMS_PAGE_SIZE,
    };
  }));
}
