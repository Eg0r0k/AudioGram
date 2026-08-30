<template>
  <TrackContextMenu context="yt-search">
    <SearchLoading v-if="isLoading" />

    <VirtualScrollable
      v-else
      class="flex-1 min-h-0"
      :items="rows"
      :estimate-size="64"
      :get-item-key="index => rows[index]?.key ?? index"
      :loading="isFetchingNextPage"
      @load-more="fetchNextPage"
    >
      <template #default="{ item, index }">
        <div class="px-3">
          <TrackRow
            v-if="item.track"
            :track="item.track"
            :artist-routes="item.artistRoutes"
            hide-index
            :menu-index="index"
            menu-target="yt-search"
            @play="play(item.track)"
          />
          <SearchDropdownRow
            v-else
            :item="item.result"
            :to="item.to ?? undefined"
          />
        </div>
      </template>

      <template #loader>
        <div class="flex justify-center py-6">
          <IconLoader class="size-5 animate-spin text-muted-foreground" />
        </div>
      </template>

      <template #empty>
        <p
          v-if="errorText"
          class="py-12 px-6 text-center text-sm text-destructive"
        >
          {{ errorText }}
        </p>
        <SearchNoResults
          v-else
          :query="query"
        />
      </template>
    </VirtualScrollable>

    <TrackDropdown context="yt-search" />
  </TrackContextMenu>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import SearchLoading from "@/modules/search/components/SearchLoading.vue";
import SearchNoResults from "@/modules/search/components/SearchNoResults.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { Track } from "@/modules/player/types";
import type { YtChip } from "@/modules/search/composables/useSearch";
import { hitResultItem, searchResultRoute, trackArtistRoutes } from "@/modules/search/lib/resultItems";
import type { SearchResultItem } from "@/modules/search/types";
import { sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { useYtSearchResults } from "../../composables/useYtSearchResults";
import { youtubeErrorMessage } from "../../lib/errors";
import IconLoader from "~icons/tabler/loader-2";

//
// One chip's results, paged. Track hits render as the shared row (they play
// and download like any other source's), everything else as the shared
// result row.
//

// Results open YouTube's view of an entity, not a library row that may exist
// under the same branded id.
const CATALOG = { catalog: true } as const;

interface Row {
  key: string;
  result: SearchResultItem;
  /** Present for track hits only — the shared row needs a Track. */
  track?: Track;
  artistRoutes?: (RouteLocationRaw | null)[];
  to?: RouteLocationRaw | null;
}

const props = defineProps<{
  chip: YtChip;
  query: string;
}>();

const { t } = useI18n();
const queueStore = useQueueStore();

const {
  hits,
  isLoading,
  isFetchingNextPage,
  error,
  fetchNextPage,
} = useYtSearchResults(toRef(props, "chip"), toRef(props, "query"));

// Built once per result set so row identity stays stable across re-renders
// (TrackRow and the context menu key off it).
const rows = computed<Row[]>(() =>
  hits.value.map((hit) => {
    const result = hitResultItem(hit, "yt", t);

    if (hit.kind === "track") {
      return {
        key: hit.item.id,
        result,
        track: sourceTrackToDisplay(hit.item),
        artistRoutes: trackArtistRoutes(hit.item, CATALOG),
      };
    }

    return { key: result.id, result, to: searchResultRoute(result, CATALOG) };
  }),
);

const errorText = computed(() => (error.value ? youtubeErrorMessage(error.value, t) : null));

const play = (track: Track) => {
  const tracks = rows.value.flatMap(row => (row.track ? [row.track] : []));
  const index = tracks.findIndex(candidate => candidate.id === track.id);
  queueStore.setQueue(tracks, Math.max(index, 0), { type: "search" });
};
</script>
