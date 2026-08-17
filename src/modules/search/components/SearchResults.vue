<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { SearchResultItem, SearchFilter } from "@/modules/search/types";
import type { Track } from "@/modules/player/types";
import type { LibraryItem } from "@/modules/library/types";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import TrackRowsList from "@/modules/tracks/components/TrackRowsList.vue";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import { computed } from "vue";

const props = defineProps<{
  activeFilter: SearchFilter;
  topResults: SearchResultItem[];
  trackResults: SearchResultItem[];
  artistResults: SearchResultItem[];
  albumResults: SearchResultItem[];
  playlistResults: SearchResultItem[];
  filteredResults: SearchResultItem[];
  trackRows: Track[];
  topTrack?: Track;
}>();

const emit = defineEmits<{
  navigate: [item: SearchResultItem];
  playTracks: [tracks: Track[], index: number];
}>();

const { t } = useI18n();

const slicedTrackResults = computed(() => props.trackRows.slice(0, 4));
const slicedArtistResults = computed(() => props.artistResults.slice(0, 4));
const slicedAlbumResults = computed(() => props.albumResults.slice(0, 4));
const slicedPlaylistResults = computed(() => props.playlistResults.slice(0, 4));

const { deleteItem } = useLibrary();

const handleDeleteEntity = (item: LibraryItem) => {
  void deleteItem(item);
};
</script>

<template>
  <LibraryContextMenu
    :folder-actions="false"
    @delete="handleDeleteEntity"
  >
    <div>
      <div v-if="activeFilter === 'all'">
        <div
          v-if="topResults.length"
          class="px-3 pt-3 pb-2"
        >
          <p class="text-sm font-medium text-muted-foreground px-1 mb-1">
            {{ t("search.bestResult") }}
          </p>
          <SearchDropdownRow
            :item="topResults[0]"
            :track="topTrack"
            @click="emit('navigate', topResults[0])"
          />
        </div>

        <div
          v-if="trackResults.length"
          class="px-3 pb-2"
        >
          <p class="text-sm font-medium text-muted-foreground px-1 mb-1">
            {{ t("search.filter.track") }}
          </p>
          <TrackRowsList
            :tracks="slicedTrackResults"
            menu-target="search"
            :show-index="false"
            @play="(_track, index) => emit('playTracks', slicedTrackResults, index)"
          />
        </div>

        <div
          v-if="artistResults.length"
          class="px-3 pb-2"
        >
          <p class="text-sm font-semibold text-muted-foreground px-1 mb-1">
            {{ t("search.filter.artist") }}
          </p>
          <SearchDropdownRow
            v-for="item in slicedArtistResults"
            :key="item.id"
            :item="item"
            @click="emit('navigate', item)"
          />
        </div>

        <div
          v-if="albumResults.length"
          class="px-3 pb-2"
        >
          <p class="text-sm font-semibold text-muted-foreground px-1 mb-1">
            {{ t("search.filter.album") }}
          </p>
          <SearchDropdownRow
            v-for="item in slicedAlbumResults"
            :key="item.id"
            :item="item"
            @click="emit('navigate', item)"
          />
        </div>

        <div
          v-if="playlistResults.length"
          class="px-3 pb-4"
        >
          <p class="text-sm font-semibold text-muted-foreground px-1 mb-1">
            {{ t("search.filter.playlist") }}
          </p>
          <SearchDropdownRow
            v-for="item in slicedPlaylistResults"
            :key="item.id"
            :item="item"
            @click="emit('navigate', item)"
          />
        </div>
      </div>

      <div
        v-else
        class="px-3 py-2 flex flex-col"
      >
        <TrackRowsList
          v-if="activeFilter === 'track'"
          :tracks="trackRows"
          menu-target="search"
          compact
          hide-cover
          @play="(_track, index) => emit('playTracks', trackRows, index)"
        />
        <template v-else>
          <SearchDropdownRow
            v-for="item in filteredResults"
            :key="item.id"
            :item="item"
            @click="emit('navigate', item)"
          />
        </template>
      </div>
    </div>
  </LibraryContextMenu>
</template>
