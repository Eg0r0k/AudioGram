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
import { computed, reactive, toRef, watch } from "vue";
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
import { playableFromMusicTrack } from "../../lib/playable";
import type { YoutubeError, YtArtistRef, YtMusicEntity, YtPlayable } from "../../types";
import { fetchYoutubeTrackAuthor } from "../../api/youtubeApi";
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

// Some search rows come with an empty artist list (YT omits the runs); the
// author is resolved lazily via video_details and cached for the session so
// paging back and forth doesn't re-fetch.
const resolvedAuthors = reactive(new Map<string, YtArtistRef>());
const requestedAuthors = new Set<string>();

watch(entities, (items) => {
  for (const item of items) {
    if (item.kind !== "track" || item.artists.length > 0) continue;
    if (requestedAuthors.has(item.id)) continue;
    requestedAuthors.add(item.id);
    fetchYoutubeTrackAuthor(item.id).match(
      author => resolvedAuthors.set(item.id, author),
      () => {}, // best-effort: the row just stays artist-less
    );
  }
}, { immediate: true });

// Ephemeral display tracks are built once per result set so their ids stay
// stable across re-renders (TrackRow/menu identity checks rely on that).
const trackRowsById = computed(() => {
  const map = new Map<string, { playable: YtPlayable; track: Track; artistRoutes: (RouteLocationRaw | null)[] }>();
  for (const item of entities.value) {
    if (item.kind !== "track") continue;
    const author = item.artists.length === 0 ? resolvedAuthors.get(item.id) : undefined;
    const playable = playableFromMusicTrack(item, undefined, author?.name ?? null);
    let artistRefs = item.artists;
    if (artistRefs.length === 0 && author) {
      artistRefs = [{ id: author.id ?? item.artistId, name: author.name }];
    }
    map.set(item.id, {
      playable,
      track: ytEphemeralTrack(playable) as PlayerTrack as Track,
      artistRoutes: ytArtistRoutes(artistRefs),
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
