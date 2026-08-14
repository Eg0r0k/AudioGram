<template>
  <TrackContextMenu context="yt-search">
    <SearchLoading v-if="isLoading" />

    <VirtualScrollable
      v-else
      class="flex-1 min-h-0"
      :items="entities"
      :estimate-size="64"
      :get-item-key="index => entities[index]?.id ?? index"
      :loading="isFetchingNextPage"
      @load-more="onLoadMore"
    >
      <template #default="{ item, index }">
        <div class="px-3">
          <TrackRow
            v-if="item.kind === 'track'"
            :track="trackRowFor(item.id)!.track"
            :cover-url="trackRowCover(item)"
            :artist-routes="trackRowFor(item.id)!.artistRoutes"
            hide-index
            :menu-index="index"
            menu-target="yt-search"
            @play="play(trackRowFor(item.id)!.playable)"
          />
          <SearchDropdownRow
            v-else
            :item="entityResultItem(item)"
            :to="entityRoute(item)"
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
import { routeLocation } from "@/app/router/route-locations";
import type { SearchResultItem } from "@/modules/search/types";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import SearchLoading from "@/modules/search/components/SearchLoading.vue";
import SearchNoResults from "@/modules/search/components/SearchNoResults.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import type { PlayerTrack, Track } from "@/modules/player/types";
import { useYtSearchList, type YtListChip } from "../../composables/useYtSearchQueries";
import { useYoutube, ytEphemeralTrack } from "../../composables/useYoutube";
import { youtubeErrorMessage } from "../../lib/errors";
import { playableFromMusicTrack, ytMusicTrackToDto } from "../../lib/playable";
import type { YoutubeError, YtMusicEntity, YtPlayable } from "../../types";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../../lib/thumbnail";
import { ytArtistRoutes, ytEntityResultItem, ytEntityRoute } from "../../lib/searchRows";
import IconLoader from "~icons/tabler/loader-2";

const props = defineProps<{
  chip: YtListChip;
  query: string;
}>();

const { t } = useI18n();
const { play } = useYoutube();

const {
  data,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error,
} = useYtSearchList(toRef(props, "chip"), toRef(props, "query"));

const entities = computed<YtMusicEntity[]>(() =>
  data.value?.pages.flatMap(page => page.items) ?? [],
);

// Ephemeral display tracks are built once per result set so their ids stay
// stable across re-renders (TrackRow/menu identity checks rely on that).
const trackRowsById = computed(() => {
  const map = new Map<string, { playable: YtPlayable; track: Track; artistRoutes: (RouteLocationRaw | null)[] }>();
  for (const item of entities.value) {
    if (item.kind !== "track") continue;
    const playable = playableFromMusicTrack(item);
    map.set(item.id, {
      playable,
      // The catalog entity rides along so a download pins the full identity.
      track: ytEphemeralTrack(playable, ytMusicTrackToDto(item)) as PlayerTrack as Track,
      artistRoutes: ytArtistRoutes(item.artists),
    });
  }
  return map;
});

function trackRowFor(id: string) {
  return trackRowsById.value.get(id);
}

function trackRowCover(item: YtMusicEntity): string | undefined {
  return item.thumbnail ? proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW) : undefined;
}

function entityResultItem(item: YtMusicEntity): SearchResultItem {
  return ytEntityResultItem(item, t);
}

function entityRoute(item: YtMusicEntity): RouteLocationRaw {
  return ytEntityRoute(item) ?? routeLocation.home();
}

const errorText = computed(() =>
  error.value ? youtubeErrorMessage(error.value as unknown as YoutubeError, t) : null,
);

function onLoadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) {
    void fetchNextPage();
  }
}
</script>
