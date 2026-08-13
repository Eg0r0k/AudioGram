import { queryOptions, skipToken } from "@tanstack/vue-query";
import { sources } from "@/modules/sources";
import type { AlbumId } from "@/types/ids";
import { queryKeys } from "./query-keys";
import { unwrapSourceResult } from "./shared";

//
// ND catalog queries — live requests against the configured Navidrome
// server, nothing is written to Dexie. Remote data goes stale slowly, so
// every option carries a 5-minute staleTime. Pass `enabled: false` intent by
// giving null ids / an unavailable source — the options fall back to
// skipToken. Infinite configs live in the composables, not here.
//

export const ND_STALE_TIME = 5 * 60_000;

const nd = () => sources.get("nd");

export const ndQueries = {
  artists: (available: boolean) =>
    queryOptions({
      queryKey: queryKeys.nd.artists(),
      staleTime: ND_STALE_TIME,
      queryFn: available ? () => unwrapSourceResult(nd().listArtists()) : skipToken,
    }),

  album: (id: AlbumId | null) =>
    queryOptions({
      queryKey: queryKeys.nd.album(id ?? ("" as AlbumId)),
      staleTime: ND_STALE_TIME,
      queryFn: id ? () => unwrapSourceResult(nd().getAlbum(id)) : skipToken,
    }),

  playlists: (available: boolean) =>
    queryOptions({
      queryKey: queryKeys.nd.playlists(),
      staleTime: ND_STALE_TIME,
      queryFn: available ? () => unwrapSourceResult(nd().listPlaylists()) : skipToken,
    }),

  playlist: (id: string | null) =>
    queryOptions({
      queryKey: queryKeys.nd.playlist(id ?? ""),
      staleTime: ND_STALE_TIME,
      queryFn: id ? () => unwrapSourceResult(nd().getPlaylist(id)) : skipToken,
    }),

  search: (q: string, types: ("track" | "album" | "artist")[], limit: number) =>
    queryOptions({
      queryKey: queryKeys.nd.search(q),
      staleTime: ND_STALE_TIME,
      queryFn: q.trim()
        ? () => unwrapSourceResult(nd().search(q, types, { offset: 0, limit }))
        : skipToken,
    }),
} as const;
