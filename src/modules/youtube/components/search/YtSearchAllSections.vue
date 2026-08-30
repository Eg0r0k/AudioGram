<template>
  <TrackContextMenu context="yt-search">
    <Scrollable class="flex-1 min-h-0">
      <SearchLoading v-if="isLoading" />

      <p
        v-else-if="errorText"
        class="py-12 px-6 text-center text-sm text-destructive"
      >
        {{ errorText }}
      </p>

      <SearchNoResults
        v-else-if="isEmpty"
        :query="query"
      />

      <div v-else>
        <div
          v-if="trackRows.length"
          class="px-3 pt-3 pb-2"
        >
          <div class="flex items-center justify-between px-1 mb-1">
            <p class="text-sm font-medium text-muted-foreground">
              {{ $t("search.filter.track") }}
            </p>
            <Button
              variant="ghost-primary"
              size="sm"
              class="rounded-full text-xs"
              @click="emit('showAll', 'tracks')"
            >
              {{ $t("search.showAll") }}
            </Button>
          </div>
          <TrackRow
            v-for="(row, index) in trackRows"
            :key="row.id"
            :track="row"
            :artist-routes="artistRoutes(row)"
            hide-index
            :menu-index="index"
            menu-target="yt-search"
            @play="play(index)"
          />
        </div>

        <YtEntitySection
          :title="$t('search.filter.artist')"
          :items="artists"
          @show-all="emit('showAll', 'artists')"
        />
        <YtEntitySection
          :title="$t('search.filter.album')"
          :items="albums"
          @show-all="emit('showAll', 'albums')"
        />
        <YtEntitySection
          :title="$t('search.filter.playlist')"
          :items="playlists"
          class="pb-4"
          @show-all="emit('showAll', 'playlists')"
        />
      </div>
    </Scrollable>

    <TrackDropdown context="yt-search" />
  </TrackContextMenu>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Scrollable } from "@/components/ui/scrollable";
import SearchLoading from "@/modules/search/components/SearchLoading.vue";
import SearchNoResults from "@/modules/search/components/SearchNoResults.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { Track } from "@/modules/player/types";
import type { YtChip } from "@/modules/search/composables/useSearch";
import { hitResultItem, trackArtistRoutes } from "@/modules/search/lib/resultItems";
import { useSourceSearchPages } from "@/modules/sources/composables/useSourceCatalog";
import { sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { youtubeErrorMessage } from "../../lib/errors";
import YtEntitySection from "./YtEntitySection.vue";

//
// The "all" chip: YouTube's own mixed shelf, cut into sections. The rows are
// the shared ones — a hit is a source DTO here like anywhere else, so a
// track plays and downloads through the same path an album page's row does.
//

const TOP_TRACKS = 5;
const TOP_ENTITIES = 4;

// Results open YouTube's view of an entity, not a library row that may exist
// under the same branded id.
const CATALOG = { catalog: true } as const;

const props = defineProps<{ query: string }>();

const emit = defineEmits<{
  showAll: [chip: YtChip];
}>();

const { t } = useI18n();
const queueStore = useQueueStore();

const { data, isLoading, error } = useSourceSearchPages("yt", toRef(props, "query"), "all");

// One shelf, not an infinite list: "all" shows the head of each kind and
// hands the rest to the per-kind chips.
const hits = computed(() => data.value?.pages[0]?.items ?? []);

const trackRows = computed<Track[]>(() =>
  hits.value
    .flatMap(hit => (hit.kind === "track" ? [hit.item] : []))
    .slice(0, TOP_TRACKS)
    .map(sourceTrackToDisplay),
);

const albums = computed(() =>
  hits.value
    .flatMap(hit => (hit.kind === "album" ? [hitResultItem(hit, "yt", t)] : []))
    .slice(0, TOP_ENTITIES),
);
const artists = computed(() =>
  hits.value
    .flatMap(hit => (hit.kind === "artist" ? [hitResultItem(hit, "yt", t)] : []))
    .slice(0, TOP_ENTITIES),
);
const playlists = computed(() =>
  hits.value
    .flatMap(hit => (hit.kind === "playlist" ? [hitResultItem(hit, "yt", t)] : []))
    .slice(0, TOP_ENTITIES),
);

const isEmpty = computed(() => hits.value.length === 0);

const errorText = computed(() => (error.value ? youtubeErrorMessage(error.value, t) : null));

const artistRoutes = (row: Track) =>
  (row.sourceDto ? trackArtistRoutes(row.sourceDto, CATALOG) : []);

const play = (index: number) => {
  queueStore.setQueue(trackRows.value, index, { type: "search" });
};
</script>
