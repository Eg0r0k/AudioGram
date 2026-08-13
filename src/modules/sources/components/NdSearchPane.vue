<template>
  <SearchFilters
    :active-filter="activeFilter"
    :available-filters="availableFilters"
    @update:filter="setFilter($event)"
  />

  <Scrollable
    direction="vertical"
    class="flex-1 min-h-0"
  >
    <div class="flex flex-col gap-4 p-4 pb-8">
      <p
        v-if="!hasQuery"
        class="text-sm text-muted-foreground"
      >
        {{ $t("search.placeholder") }}
      </p>

      <p
        v-else-if="isFetched && isEmpty"
        class="text-sm text-muted-foreground"
      >
        {{ $t("search.noResults.title", { query: debouncedQuery }) }}
      </p>

      <section v-if="showSection('track') && tracks.length > 0">
        <h3 class="mb-2 text-sm font-medium text-muted-foreground">
          {{ $t("search.filter.track") }}
        </h3>
        <button
          v-for="(track, index) in tracks"
          :key="track.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          @click="playTrack(index)"
          @contextmenu.prevent="openTrackMenu(track, index)"
        >
          <NuxtImage
            :src="coverFor(track.sourceDto?.coverRef)"
            :alt="track.title"
            class="size-10 shrink-0 rounded object-cover"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{{ track.title }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ track.artist }}</span>
          </span>
        </button>
      </section>

      <section v-if="showSection('album') && albums.length > 0">
        <h3 class="mb-2 text-sm font-medium text-muted-foreground">
          {{ $t("search.filter.album") }}
        </h3>
        <button
          v-for="album in albums"
          :key="album.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          @click="goTo(routeLocation.album(album.id))"
        >
          <NuxtImage
            :src="coverFor(album.coverRef)"
            :alt="album.title"
            class="size-10 shrink-0 rounded object-cover"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm">{{ album.title }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ album.artistName }}</span>
          </span>
        </button>
      </section>

      <section v-if="showSection('playlist') && playlists.length > 0">
        <h3 class="mb-2 text-sm font-medium text-muted-foreground">
          {{ $t("search.filter.playlist") }}
        </h3>
        <button
          v-for="playlist in playlists"
          :key="playlist.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          @click="goTo(routeLocation.playlist(PlaylistId(`nd:${playlist.id}`)))"
        >
          <NuxtImage
            :src="coverFor(playlist.coverRef)"
            :alt="playlist.name"
            class="size-10 shrink-0 rounded object-cover"
          />
          <span class="min-w-0 flex-1 truncate text-sm">{{ playlist.name }}</span>
        </button>
      </section>

      <section v-if="showSection('artist') && artists.length > 0">
        <h3 class="mb-2 text-sm font-medium text-muted-foreground">
          {{ $t("search.filter.artist") }}
        </h3>
        <button
          v-for="artist in artists"
          :key="artist.id"
          type="button"
          class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-accent"
          @click="goTo(routeLocation.artist(artist.id))"
        >
          <NuxtImage
            :src="coverFor(artist.coverRef)"
            :alt="artist.name"
            class="size-10 shrink-0 rounded-full object-cover"
          />
          <span class="min-w-0 flex-1 truncate text-sm">{{ artist.name }}</span>
        </button>
      </section>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { refDebounced } from "@vueuse/core";
import { useRouter, type RouteLocationRaw } from "vue-router";
import { Scrollable } from "@/components/ui/scrollable";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { routeLocation } from "@/app/router/route-locations";
import { useSearch } from "@/modules/search/composables/useSearch";
import SearchFilters from "@/modules/search/components/SearchFilters.vue";
import type { SearchFilter } from "@/modules/search/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { Track } from "@/modules/player/types";
import { PlaylistId } from "@/types/ids";
import { useNdPlaylists, useNdSearch } from "../composables/useNdCatalog";
import { sourceCoverUrl, sourceTrackToDisplay, THUMB_SIZE_ROW } from "../lib/display";

const SEARCH_DEBOUNCE_MS = 300;

const router = useRouter();
const queueStore = useQueueStore();
const { openMenu } = useTrackMenu();
const { query, closeSearch, saveQueryToHistory, activeFilter, availableFilters, setFilter } = useSearch();

/** Same filter axis as the library pane; sections narrow on the client. */
function showSection(type: SearchFilter) {
  return activeFilter.value === "all" || activeFilter.value === type;
}

const debouncedQuery = refDebounced(computed(() => query.value.trim()), SEARCH_DEBOUNCE_MS);
const hasQuery = computed(() => debouncedQuery.value.length > 0);

const searchQuery = useNdSearch(debouncedQuery);
const isFetched = computed(() => searchQuery.isFetched.value);

const tracks = computed(() => (searchQuery.data.value?.tracks ?? []).map(sourceTrackToDisplay));
const albums = computed(() => searchQuery.data.value?.albums ?? []);
const artists = computed(() => searchQuery.data.value?.artists ?? []);

// search3 does not cover playlists — filter the (5-min-cached) playlist
// list by name on the client instead.
const playlistsQuery = useNdPlaylists();
const playlists = computed(() => {
  const q = debouncedQuery.value.toLowerCase();
  if (!q) return [];
  return (playlistsQuery.data.value ?? [])
    .filter(playlist => playlist.name.toLowerCase().includes(q))
    .slice(0, 10);
});

const isEmpty = computed(() =>
  tracks.value.length === 0
  && albums.value.length === 0
  && artists.value.length === 0
  && playlists.value.length === 0,
);

function coverFor(coverRef: string | undefined) {
  return sourceCoverUrl("nd", coverRef, THUMB_SIZE_ROW) || undefined;
}

function playTrack(index: number) {
  saveQueryToHistory();
  queueStore.setQueue(tracks.value, index, { type: "unknown" }).catch(() => {});
}

function openTrackMenu(track: Track, index: number) {
  openMenu(track, index, { target: "search" });
}

function goTo(location: RouteLocationRaw) {
  saveQueryToHistory();
  closeSearch();
  router.push(location);
}
</script>
