<template>
  <div class="flex flex-col flex-1 min-h-0">
    <SearchFilters
      :active-filter="activeFilter"
      :available-filters="availableFilters"
      @update:filter="setFilter($event)"
    />

    <Scrollable class="flex-1 min-h-0">
      <SearchLoading v-if="isLoading" />

      <div
        v-else-if="!hasQuery"
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
        :query="debouncedQuery"
      />

      <SearchResults
        v-else
        :active-filter="activeFilter"
        :top-results="[]"
        :track-results="trackResults"
        :artist-results="artistResults"
        :album-results="albumResults"
        :playlist-results="playlistResults"
        :filtered-results="filteredResults"
        :track-rows="trackRows"
        @navigate="navigate"
        @play-tracks="playTracks"
      />
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { refDebounced } from "@vueuse/core";
import { useRouter } from "vue-router";
import { Scrollable } from "@/components/ui/scrollable";
import { routeLocation } from "@/app/router/route-locations";
import { useSearch } from "@/modules/search/composables/useSearch";
import type { SearchResultItem } from "@/modules/search/types";
import SearchFilters from "@/modules/search/components/SearchFilters.vue";
import SearchLoading from "@/modules/search/components/SearchLoading.vue";
import SearchEmptyPlaceholder from "@/modules/search/components/SearchEmptyPlaceholder.vue";
import SearchNoResults from "@/modules/search/components/SearchNoResults.vue";
import SearchRecentQueries from "@/modules/search/components/SearchRecentQueries.vue";
import SearchResults from "@/modules/search/components/SearchResults.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { Track } from "@/modules/player/types";
import { useSourcePlaylists, useSourceSearch } from "../composables/useSourceCatalog";
import { sourceCoverUrl, sourceTrackToDisplay, THUMB_SIZE_ROW } from "../lib/display";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_PLAYLIST_MATCHES = 10;

const router = useRouter();
const queueStore = useQueueStore();
const {
  query,
  activeFilter,
  availableFilters,
  recentQueries,
  setFilter,
  saveQueryToHistory,
  removeHistoryItem,
  clearHistory,
  applyHistoryItem,
} = useSearch();

const debouncedQuery = refDebounced(computed(() => query.value.trim()), SEARCH_DEBOUNCE_MS);
const hasQuery = computed(() => debouncedQuery.value.length > 0);

const searchQuery = useSourceSearch("nd", debouncedQuery);
const isLoading = computed(() => hasQuery.value && searchQuery.isLoading.value);

function coverFor(coverRef: string | undefined) {
  return sourceCoverUrl("nd", coverRef, THUMB_SIZE_ROW) || undefined;
}

const trackRows = computed<Track[]>(() =>
  (searchQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay),
);

const trackResults = computed<SearchResultItem[]>(() =>
  trackRows.value.map(track => ({
    id: track.id,
    type: "track",
    title: track.title,
    artist: track.artist,
    entityId: track.id,
    score: 0,
  })),
);

const albumResults = computed<SearchResultItem[]>(() =>
  (searchQuery.data.value?.albums ?? []).map(album => ({
    id: album.id,
    type: "album",
    title: album.title,
    artist: album.artistName,
    entityId: album.id,
    score: 0,
    coverPath: coverFor(album.coverRef),
  })),
);

const artistResults = computed<SearchResultItem[]>(() =>
  (searchQuery.data.value?.artists ?? []).map(artist => ({
    id: artist.id,
    type: "artist",
    title: artist.name,
    entityId: artist.id,
    score: 0,
    coverPath: coverFor(artist.coverRef),
  })),
);

// search3 does not cover playlists — filter the (5-min-cached) playlist
// list by name on the client instead.
const playlistsQuery = useSourcePlaylists("nd");
const playlistResults = computed<SearchResultItem[]>(() => {
  const q = debouncedQuery.value.toLowerCase();
  if (!q) return [];
  return (playlistsQuery.data.value ?? [])
    .filter(playlist => playlist.name.toLowerCase().includes(q))
    .slice(0, MAX_PLAYLIST_MATCHES)
    .map(playlist => ({
      id: playlist.id,
      type: "playlist" as const,
      title: playlist.name,
      entityId: playlist.id,
      score: 0,
      coverPath: coverFor(playlist.coverRef),
    }));
});

const hasResults = computed(() =>
  trackResults.value.length > 0
  || albumResults.value.length > 0
  || artistResults.value.length > 0
  || playlistResults.value.length > 0,
);

const filteredResults = computed<SearchResultItem[]>(() => {
  switch (activeFilter.value) {
    case "artist": return artistResults.value;
    case "album": return albumResults.value;
    case "playlist": return playlistResults.value;
    default: return [];
  }
});

function navigate(item: SearchResultItem) {
  saveQueryToHistory();
  switch (item.type) {
    case "artist":
      router.push(routeLocation.artist(item.entityId));
      break;
    case "album":
      router.push(routeLocation.album(item.entityId));
      break;
    case "playlist":
      router.push(routeLocation.playlist(item.entityId));
      break;
  }
}

async function playTracks(tracks: Track[], index: number) {
  if (tracks.length === 0) return;
  saveQueryToHistory();
  await queueStore.setQueue(tracks, index, { type: "search" });
}
</script>
