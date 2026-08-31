<template>
  <div class="flex flex-col flex-1 min-h-0">
    <SearchFilters
      :active-filter="activeFilter"
      :available-filters="availableFilters"
      @update:filter="setFilter($event)"
    />

    <SourceHealthNotice
      :kind="remoteKind"
      class="mx-4 mt-2"
    />

    <Scrollable class="flex-1 min-h-0">
      <SearchLoading v-if="results.isLoading.value" />

      <div
        v-else-if="!results.hasQuery.value"
        class="flex flex-col py-6 gap-4 px-4 pt-0"
      >
        <SearchRecentQueries
          v-if="recentQueries.length"
          :items="recentQueries"
          @apply="applyHistoryItem"
          @remove="removeHistoryItem"
          @clear="clearHistory"
        />
        <SearchEmptyPlaceholder />
      </div>

      <SearchNoResults
        v-else-if="!hasResults"
        :query="results.query.value"
      />

      <SearchResults
        v-else
        :active-filter="activeFilter"
        :top-results="results.top.value"
        :track-results="results.groups.value.track"
        :artist-results="results.groups.value.artist"
        :album-results="results.groups.value.album"
        :playlist-results="results.groups.value.playlist"
        :filtered-results="filteredResults"
        :track-rows="results.trackRows.value"
        :top-track="results.topTrack.value"
        @navigate="navigate"
        @play-tracks="playTracks"
      />
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Scrollable } from "@/components/ui/scrollable";
import { getLogger } from "@/lib/logger";
import { searchResultRoute } from "../lib/resultItems";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { Track } from "@/modules/player/types";
import type { SourceKind } from "@/types/track-ref";
import SearchFilters from "./SearchFilters.vue";
import SearchLoading from "./SearchLoading.vue";
import SearchEmptyPlaceholder from "./SearchEmptyPlaceholder.vue";
import SearchNoResults from "./SearchNoResults.vue";
import SearchRecentQueries from "./SearchRecentQueries.vue";
import SearchResults from "./SearchResults.vue";
import SourceHealthNotice from "@/modules/sources/components/SourceHealthNotice.vue";
import { useSearch } from "../composables/useSearch";
import { useSearchPaneResults } from "../composables/useSearchPaneResults";
import type { SearchResultItem } from "../types";

//
// The search pane for any source. What differs between sources is where the
// results come from and which view their links open; the shell, the empty
// and loading states, the history and the queueing are the same everywhere.
//

const props = defineProps<{ kind: SourceKind }>();

const router = useRouter();
const queueStore = useQueueStore();

const {
  activeFilter,
  availableFilters,
  recentQueries,
  setFilter,
  saveQueryToHistory,
  removeHistoryItem,
  clearHistory,
  applyHistoryItem,
} = useSearch();

const results = useSearchPaneResults(computed(() => props.kind));

const hasResults = computed(() => {
  if (results.top.value.length > 0) return true;
  const groups = results.groups.value;
  return groups.track.length > 0 || groups.artist.length > 0
    || groups.album.length > 0 || groups.playlist.length > 0;
});

const filteredResults = computed<SearchResultItem[]>(() =>
  (activeFilter.value === "all"
    ? results.top.value
    : results.groups.value[activeFilter.value]),
);

// Results of searching a source open that source's view of the entity, even
// when its tracks are already downloaded under the same branded id.
const intent = computed(() => ({ catalog: props.kind !== "local" }));

// The library index cannot be unreachable or reject a password.
const remoteKind = computed(() => (props.kind === "local" ? null : props.kind));

function navigate(item: SearchResultItem) {
  saveQueryToHistory();

  if (item.type === "track") {
    // Picking a track result plays that one track; the row is already
    // loaded, so there is nothing left to fetch.
    const track = results.trackRows.value.find(row => row.id === item.entityId);
    if (track) playTracks([track], 0).catch(error => getLogger().error(`[Search] Playing a track result failed: ${String(error)}`));
    return;
  }

  const to = searchResultRoute(item, intent.value);
  if (to) router.push(to).catch(error => getLogger().error(`[Search] Navigation to a result failed: ${String(error)}`));
}

async function playTracks(tracks: Track[], index: number) {
  if (tracks.length === 0) return;
  saveQueryToHistory();
  await queueStore.setQueue(tracks, index, { type: "search" });
}
</script>
