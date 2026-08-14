import { computed, type Ref } from "vue";
import { useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import { queryKeys } from "@/queries/query-keys";
import { youtubeProvider } from "../provider";
import type {
  YtAlbumDetail,
  YtArtistDetail,
  YtMusicEntity,
  YtMusicSearchKind,
  YtMusicTrack,
  YtPage,
  YtPlaylistDetail,
  YtSearchResult,
} from "../types";

const STALE_TIME_MS = 5 * 60_000;

/** Chip values for per-type search lists. `videos` uses the plain video API. */
export type YtListChip = YtMusicSearchKind | "videos";

function videoToEntity(video: YtSearchResult): YtMusicEntity {
  return {
    kind: "track",
    id: video.id,
    title: video.title,
    artists: video.uploader ? [{ id: null, name: video.uploader }] : [],
    artistId: null,
    album: null,
    duration: video.duration,
    thumbnail: video.thumbnail,
    isVideo: true,
    trackNr: null,
  };
}

function videoPageToEntityPage(page: YtPage<YtSearchResult>): YtPage<YtMusicEntity> {
  return { ...page, items: page.items.map(videoToEntity) };
}

/** Combined top results for the "All" chip. */
export function useYtSearchAll(query: Ref<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.youtube.searchAll(query.value)),
    queryFn: async () => {
      const result = await youtubeProvider.searchMusic(query.value, "all");
      if (result.isErr()) throw result.error;
      return result.value;
    },
    enabled: computed(() => youtubeProvider.isAvailable && query.value.length > 0),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
}

/** Per-type infinite list (tracks/albums/artists/playlists/videos). */
export function useYtSearchList(chip: Ref<YtListChip>, query: Ref<string>) {
  return useInfiniteQuery({
    queryKey: computed(() => queryKeys.youtube.searchList(chip.value, query.value)),
    queryFn: async ({ pageParam }): Promise<YtPage<YtMusicEntity>> => {
      if (chip.value === "videos") {
        const result = pageParam
          ? await youtubeProvider.continueVideos(pageParam)
          : await youtubeProvider.searchVideos(query.value);
        if (result.isErr()) throw result.error;
        return videoPageToEntityPage(result.value);
      }
      const kind = chip.value as YtMusicSearchKind;
      const result = pageParam
        ? await youtubeProvider.continueMusic(pageParam, kind)
        : await youtubeProvider.searchMusic(query.value, kind);
      if (result.isErr()) throw result.error;
      return result.value;
    },
    initialPageParam: "",
    getNextPageParam: last => last.continuation ?? undefined,
    enabled: computed(() => youtubeProvider.isAvailable && query.value.length > 0),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
}

interface YtPlaylistPage {
  meta: Omit<YtPlaylistDetail, "tracks"> | null;
  tracks: YtMusicTrack[];
  continuation: string | null;
}

/** Playlist detail with paginated tracks (first page carries the meta). */
export function useYtPlaylist(id: Ref<string>) {
  return useInfiniteQuery({
    queryKey: computed(() => queryKeys.youtube.playlist(id.value)),
    queryFn: async ({ pageParam }): Promise<YtPlaylistPage> => {
      if (!pageParam) {
        const result = await youtubeProvider.playlist(id.value);
        if (result.isErr()) throw result.error;
        const { tracks, ...meta } = result.value;
        return { meta, tracks: tracks.items, continuation: tracks.continuation };
      }
      const result = await youtubeProvider.continueMusic(pageParam, "tracks");
      if (result.isErr()) throw result.error;
      const tracks = result.value.items.filter(
        (item): item is Extract<YtMusicEntity, { kind: "track" }> => item.kind === "track",
      );
      return { meta: null, tracks, continuation: result.value.continuation };
    },
    initialPageParam: "",
    getNextPageParam: last => last.continuation ?? undefined,
    enabled: computed(() => youtubeProvider.isAvailable && id.value.length > 0),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
}

/** Album detail — bounded, single fetch. */
export function useYtAlbum(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.youtube.album(id.value)),
    queryFn: async (): Promise<YtAlbumDetail> => {
      const result = await youtubeProvider.album(id.value);
      if (result.isErr()) throw result.error;
      return result.value;
    },
    enabled: computed(() => youtubeProvider.isAvailable && id.value.length > 0),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
}

/** Artist detail — top tracks + albums + playlists in one call. */
export function useYtArtist(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => queryKeys.youtube.artist(id.value)),
    queryFn: async (): Promise<YtArtistDetail> => {
      const result = await youtubeProvider.artist(id.value);
      if (result.isErr()) throw result.error;
      return result.value;
    },
    enabled: computed(() => youtubeProvider.isAvailable && id.value.length > 0),
    staleTime: STALE_TIME_MS,
    retry: 1,
  });
}
