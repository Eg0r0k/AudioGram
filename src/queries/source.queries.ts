import { queryOptions, skipToken, type QueryClient } from "@tanstack/vue-query";
import { sources } from "@/modules/sources";
import type { SourceKind } from "@/types/track-ref";
import type { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import type { SourcePlaylistDTO } from "@/types/source-dto";
import { queryKeys } from "./query-keys";
import { unwrapSourceResult } from "./shared";

// Remote-source catalog queries: live requests, nothing is written to Dexie.
// Null kind / null id / unavailable source → skipToken. Infinite configs
// live in the composables.

export const SOURCE_STALE_TIME = 5 * 60_000;

/** The client default is `networkMode: "always"` (Dexie); a remote read waits for the network. */
export const REMOTE_QUERY_OPTIONS = {
  staleTime: SOURCE_STALE_TIME,
  networkMode: "online",
} as const;

/**
 * Query roots a source's answers land under. The YouTube search pane predates
 * the shared source keys and still caches under its own root, so a source is
 * not fully invalidated by its `source` slice alone.
 */
const rootsOf = (kind: SourceKind): (readonly unknown[])[] =>
  kind === "yt"
    ? [queryKeys.source.ofKind(kind), queryKeys.youtube.all()]
    : [queryKeys.source.ofKind(kind)];

/**
 * Drops what one source answered — its own configuration changed, so the
 * cached answers came from a server (or an account) that is no longer the
 * one being asked.
 */
export const invalidateSource = async (client: QueryClient, kind: SourceKind): Promise<void> => {
  await Promise.all(rootsOf(kind).map(queryKey => client.invalidateQueries({ queryKey })));
};

/**
 * Drops what *every* remote source answered — the route out changed, so every
 * cached answer travelled a path that no longer applies. Without this the
 * cache keeps serving pre-change results for the whole `SOURCE_STALE_TIME`,
 * failures included: enabling a proxy and going straight back to the search
 * that just failed would show the same failure, and nothing would retry it.
 * Mounted queries refetch at once; the rest are marked stale.
 */
export const invalidateRemoteSources = async (client: QueryClient): Promise<void> => {
  await Promise.all(
    [queryKeys.source.all(), queryKeys.youtube.all()]
      .map(queryKey => client.invalidateQueries({ queryKey })),
  );
};

/**
 * The playlist whole, on demand — queue-all and download-all need every
 * track, not the pages a browsing view has scrolled to. Shares its cache
 * entry with `sourceQueries(kind).playlist`.
 */
export const fetchSourcePlaylist = (client: QueryClient, kind: SourceKind, id: PlaylistId) =>
  client.fetchQuery({
    queryKey: queryKeys.source.playlist(kind, id),
    ...REMOTE_QUERY_OPTIONS,
    queryFn: () => unwrapSourceResult(sources.get(kind).getPlaylist(id), kind),
  });

/** `kind: null` — no remote source applies; every option parks on skipToken. */
export function sourceQueries(kind: SourceKind | null) {
  return {
    artists: (available: boolean) =>
      queryOptions({
        queryKey: queryKeys.source.artists(kind),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && available
          ? () => unwrapSourceResult(sources.get(kind).listArtists(), kind)
          : skipToken,
      }),

    album: (id: AlbumId | null) =>
      queryOptions({
        queryKey: queryKeys.source.album(kind, id),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getAlbum(id), kind)
          : skipToken,
      }),

    artist: (id: ArtistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.artist(kind, id),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getArtist(id), kind)
          : skipToken,
      }),

    playlists: (available: boolean) =>
      queryOptions({
        queryKey: queryKeys.source.playlists(kind),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && available
          ? () => unwrapSourceResult(sources.get(kind).listPlaylists(), kind)
          : skipToken,
      }),

    playlist: (id: PlaylistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.playlist(kind, id),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && id
          ? () => unwrapSourceResult(sources.get(kind).getPlaylist(id), kind)
          : skipToken,
      }),

    /**
     * Playlist metadata without its tracks. A source that pages its
     * playlists answers from the first page; one that does not has to fetch
     * the playlist whole, which is what opening it would cost anyway.
     */
    playlistMeta: (id: PlaylistId | null) =>
      queryOptions({
        queryKey: queryKeys.source.playlistMeta(kind, id),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && id
          ? async (): Promise<SourcePlaylistDTO | null> => {
            const provider = sources.get(kind);
            if (provider.getPlaylistPage) {
              const first = await unwrapSourceResult(provider.getPlaylistPage(id, null), kind);
              return first.playlist;
            }
            return (await unwrapSourceResult(provider.getPlaylist(id), kind)).playlist;
          }
          : skipToken,
      }),

    search: (q: string, types: ("track" | "album" | "artist")[], limit: number) =>
      queryOptions({
        queryKey: queryKeys.source.search(kind, q),
        ...REMOTE_QUERY_OPTIONS,
        queryFn: kind && q.trim()
          ? () => unwrapSourceResult(sources.get(kind).search(q, types, { offset: 0, limit }), kind)
          : skipToken,
      }),
  } as const;
}
