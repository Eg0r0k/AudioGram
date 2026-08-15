import { queryOptions, skipToken } from "@tanstack/vue-query";
import { sources } from "@/modules/sources";
import type { SourceKind } from "@/types/track-ref";
import type { AlbumId, ArtistId } from "@/types/ids";
import { queryKeys } from "./query-keys";
import { unwrapSourceResult } from "./shared";

//
// Remote-source catalog queries — live requests against the provider's
// server, nothing is written to Dexie. Remote data goes stale slowly, so
// every option carries a 5-minute staleTime. Pass `enabled: false` intent by
// giving a null kind / null ids / an unavailable source — the options fall
// back to skipToken. Infinite configs live in the composables, not here.
//
// ND is the only catalog-capable source today; a third source reuses this
// layer by kind instead of copying it.
//

export const SOURCE_STALE_TIME = 5 * 60_000;

/**
 * Query-option factories for one source. `kind: null` means "no remote
 * source applies here" — every option parks on skipToken while its key
 * keeps a stable slot.
 */
export function sourceQueries(kind: SourceKind | null) {
  return {
    artists: (available: boolean) =>
      queryOptions({
        queryKey: queryKeys.source.artists(kind),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && available
          ? () => unwrapSourceResult(sources.get(kind).listArtists())
          : skipToken,
      }),

    album: (id: AlbumId | null) =>
      queryOptions({
        queryKey: queryKeys.source.album(kind, id ?? ("" as AlbumId)),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getAlbum(id))
          : skipToken,
      }),

    artist: (id: ArtistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.artist(kind, id ?? ("" as ArtistId)),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getArtist(id))
          : skipToken,
      }),

    playlists: (available: boolean) =>
      queryOptions({
        queryKey: queryKeys.source.playlists(kind),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && available
          ? () => unwrapSourceResult(sources.get(kind).listPlaylists())
          : skipToken,
      }),

    playlist: (id: string | null) =>
      queryOptions({
        queryKey: queryKeys.source.playlist(kind, id ?? ""),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getPlaylist(id))
          : skipToken,
      }),

    search: (q: string, types: ("track" | "album" | "artist")[], limit: number) =>
      queryOptions({
        queryKey: queryKeys.source.search(kind, q),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && q.trim()
          ? () => unwrapSourceResult(sources.get(kind).search(q, types, { offset: 0, limit }))
          : skipToken,
      }),
  } as const;
}
