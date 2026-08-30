import { computed, type ComputedRef, type Ref } from "vue";
import { skipToken, useInfiniteQuery } from "@tanstack/vue-query";
import { queryKeys } from "@/queries/query-keys";
import { SourceQueryError } from "@/queries/shared";
import { useSourceSearchPages } from "@/modules/sources/composables/useSourceCatalog";
import type { SourcePage, SourceSearchHit, SourceSearchScope } from "@/modules/sources/types";
import type { YtChip } from "@/modules/search/composables/useSearch";
import { youtubeProvider } from "../provider";
import { ytVideoToDto } from "../lib/playable";
import { ytErrorToSource } from "../lib/errors";

//
// YouTube search results in the shared shape. Everything YouTube Music
// answers goes through the source layer like any other source's search; the
// videos chip does not, because a catalog of non-music videos is not a
// notion the generic contract has — nor should it grow one for a single
// source. Both arrive here as pages of the same hit, so the list that
// renders them stays one list.
//

const STALE_TIME_MS = 5 * 60_000;

const SCOPE_OF: Record<Exclude<YtChip, "videos">, SourceSearchScope> = {
  all: "all",
  tracks: "track",
  albums: "album",
  artists: "artist",
  playlists: "playlist",
};

export interface YtSearchResults {
  hits: ComputedRef<SourceSearchHit[]>;
  isLoading: ComputedRef<boolean>;
  isFetchingNextPage: ComputedRef<boolean>;
  hasNextPage: ComputedRef<boolean>;
  error: ComputedRef<Error | null>;
  fetchNextPage: () => void;
}

/** The plain-video catalog: YouTube's own, with no generic counterpart. */
const useYtVideoPages = (query: Ref<string>) =>
  useInfiniteQuery(computed(() => ({
    queryKey: queryKeys.youtube.videoSearch(query.value),
    staleTime: STALE_TIME_MS,
    initialPageParam: "",
    queryFn: query.value
      ? async ({ pageParam }: { pageParam: string }): Promise<SourcePage<SourceSearchHit>> => {
        const result = pageParam
          ? await youtubeProvider.continueVideos(pageParam)
          : await youtubeProvider.searchVideos(query.value);

        if (result.isErr()) {
          // Same shape a source failure has, so one pane renders both.
          const error = ytErrorToSource(result.error);
          throw new SourceQueryError(error.kind, error.message);
        }

        return {
          items: result.value.items.map(video => ({
            kind: "track" as const,
            item: ytVideoToDto(video),
          })),
          cursor: result.value.continuation,
        };
      }
      : skipToken,
    getNextPageParam: (last: SourcePage<SourceSearchHit>) => last.cursor ?? undefined,
  })));

/**
 * One chip's results, whichever catalog answers it. Both queries are held —
 * composables cannot be called in a branch — and the one that is not asked
 * for parks on an empty query.
 */
export const useYtSearchResults = (
  chip: Ref<YtChip>,
  query: Ref<string>,
): YtSearchResults => {
  const isVideos = computed(() => chip.value === "videos");

  const music = useSourceSearchPages(
    "yt",
    computed(() => (isVideos.value ? "" : query.value)),
    computed(() => (isVideos.value ? "all" : SCOPE_OF[chip.value as Exclude<YtChip, "videos">])),
  );
  const videos = useYtVideoPages(computed(() => (isVideos.value ? query.value : "")));

  const active = () => (isVideos.value ? videos : music);

  return {
    hits: computed(() => active().data.value?.pages.flatMap(page => page.items) ?? []),
    isLoading: computed(() => active().isLoading.value),
    isFetchingNextPage: computed(() => active().isFetchingNextPage.value),
    hasNextPage: computed(() => active().hasNextPage.value),
    error: computed(() => active().error.value),
    fetchNextPage: () => {
      const query = active();
      if (query.hasNextPage.value && !query.isFetchingNextPage.value) query.fetchNextPage();
    },
  };
};
