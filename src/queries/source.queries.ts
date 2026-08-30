import { queryOptions, skipToken } from "@tanstack/vue-query";
import { sources } from "@/modules/sources";
import type { SourceKind } from "@/types/track-ref";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import { queryKeys } from "./query-keys";
import { unwrapSourceResult } from "./shared";

// Remote-source catalog queries: live requests, nothing is written to Dexie.
// Null kind / null id / unavailable source → skipToken. Infinite configs
// live in the composables.

export const SOURCE_STALE_TIME = 5 * 60_000;

/** `kind: null` — no remote source applies; every option parks on skipToken. */
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
        queryKey: queryKeys.source.album(kind, id),
        staleTime: SOURCE_STALE_TIME,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getAlbum(id))
          : skipToken,
      }),

    artist: (id: ArtistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.artist(kind, id),
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

    playlist: (id: PlaylistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.playlist(kind, id),
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
