<template>
  <div class="flex flex-col flex-1 min-h-0">
    <Empty
      v-if="!isAvailable"
      class="p-6 py-12 md:p-6 md:py-12"
    >
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          class="rounded-full text-muted-foreground"
        >
          <IconCloudOff class="size-5" />
        </EmptyMedia>
        <EmptyDescription>{{ $t("youtube.unavailable") }}</EmptyDescription>
      </EmptyHeader>
    </Empty>

    <template v-else>
      <div
        v-if="linkTarget"
        class="px-3 py-3"
      >
        <p class="px-1 mb-1 text-sm font-medium text-muted-foreground">
          {{ $t("search.ytLinkDetected") }}
        </p>

        <template v-if="linkTarget.kind === 'video'">
          <div
            v-if="!linkVideo"
            class="h-14 animate-pulse rounded-lg bg-muted/50"
          />
          <TrackContextMenu
            v-else
            context="yt-search"
          >
            <TrackRow
              :track="linkVideo.track"
              :cover-url="linkVideo.cover"
              hide-index
              :menu-index="0"
              menu-target="yt-search"
              @play="play(linkVideo.playable)"
            />
            <TrackDropdown context="yt-search" />
          </TrackContextMenu>
        </template>

        <SearchDropdownRow
          v-else-if="linkItem && linkRoute"
          :item="linkItem"
          :to="linkRoute"
        />
      </div>

      <template v-else>
        <YtSearchChips
          :chip="ytChip"
          @update:chip="setYtChip"
        />

        <Scrollable
          v-if="!submittedYtQuery"
          class="flex-1 min-h-0"
        >
          <div class="flex flex-col py-6 gap-4 px-4 pt-0">
            <SearchRecentQueries
              v-if="recentQueries.length"
              :items="recentQueries"
              @apply="applyYtHistoryItem"
              @remove="removeHistoryItem"
              @clear="clearHistory"
            />
            <SearchEmptyPlaceholder :text="$t('search.ytHint')">
              <template #icon>
                <IconBrandYoutube class="size-20 text-muted-foreground" />
              </template>
            </SearchEmptyPlaceholder>
          </div>
        </Scrollable>

        <YtSearchAllSections
          v-else-if="ytChip === 'all'"
          :query="submittedYtQuery"
          @show-all="setYtChip"
        />
        <YtSearchList
          v-else
          :chip="ytChip"
          :query="submittedYtQuery"
        />
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { RouteLocationRaw } from "vue-router";
import { useSearch } from "@/modules/search/composables/useSearch";
import { Scrollable } from "@/components/ui/scrollable";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import IconCloudOff from "~icons/tabler/cloud-off";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import SearchEmptyPlaceholder from "@/modules/search/components/SearchEmptyPlaceholder.vue";
import SearchRecentQueries from "@/modules/search/components/SearchRecentQueries.vue";
import type { SearchResultItem } from "@/modules/search/types";
import { routeLocation } from "@/app/router/route-locations";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import type { PlayerTrack, Track } from "@/modules/player/types";
import { youtubeProvider } from "../../provider";
import { parseYoutubeCollectionUrl } from "../../lib/url";
import { playableFromVideo } from "../../lib/playable";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../../lib/thumbnail";
import { useYoutube, ytEphemeralTrack } from "../../composables/useYoutube";
import type { YtPlayable } from "../../types";
import IconBrandYoutube from "~icons/tabler/brand-youtube-filled";
import YtSearchAllSections from "./YtSearchAllSections.vue";
import YtSearchChips from "./YtSearchChips.vue";
import YtSearchList from "./YtSearchList.vue";

const {
  query,
  ytChip,
  setYtChip,
  submittedYtQuery,
  recentQueries,
  removeHistoryItem,
  clearHistory,
  applyHistoryItem,
  submitYtSearch,
} = useSearch();

const { t } = useI18n();

const isAvailable = youtubeProvider.isAvailable;

// A pasted collection link resolves straight from the LIVE query — no
// debounce, no network: the row appears the moment the URL lands.
const linkTarget = computed(() => parseYoutubeCollectionUrl(query.value));

const linkItem = computed<SearchResultItem | null>(() => {
  const target = linkTarget.value;
  if (!target || target.kind === "video") return null;

  const titles = {
    playlist: t("search.ytLinkPlaylist"),
    album: t("search.ytLinkAlbum"),
    artist: t("search.ytLinkArtist"),
  } as const;

  return {
    id: `yt-link-${target.id}`,
    type: target.kind,
    title: titles[target.kind],
    artist: target.id,
    entityId: target.id,
    score: 0,
  };
});

const linkRoute = computed<RouteLocationRaw | null>(() => {
  const target = linkTarget.value;
  if (!target) return null;
  switch (target.kind) {
    case "playlist": return routeLocation.ytPlaylist(target.id);
    case "album": return routeLocation.ytAlbum(target.id);
    case "artist": return routeLocation.ytArtist(target.id);
    default: return null;
  }
});

const { play } = useYoutube();

interface LinkVideoRow {
  playable: YtPlayable;
  track: Track;
  cover?: string;
}

// A bare/mix video link carries no metadata of its own — a search by the raw
// id returns the exact video (title, thumbnail, duration), fetched eagerly so
// the pasted link renders as a real TrackRow. If the lookup misses, the row
// still plays blind: the stream proxy needs only the id, and the thumbnail
// URL shape is deterministic.
const linkVideo = shallowRef<LinkVideoRow | null>(null);

watch(linkTarget, async (target) => {
  linkVideo.value = null;
  if (!target || target.kind !== "video") return;

  const id = target.id;
  const results = await youtubeProvider.search(id);
  const current = linkTarget.value;
  if (!current || current.kind !== "video" || current.id !== id) return;

  const match = results.isOk()
    ? results.value.find(video => video.id === id)
    : undefined;
  const playable: YtPlayable = match
    ? playableFromVideo(match)
    : {
        id,
        title: `YouTube · ${id}`,
        artist: null,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: null,
      };

  linkVideo.value = {
    playable,
    track: ytEphemeralTrack(playable) as PlayerTrack as Track,
    cover: playable.thumbnail ? proxiedThumbnail(playable.thumbnail, THUMB_SIZE_ROW) : undefined,
  };
}, { immediate: true });

function applyYtHistoryItem(value: string) {
  applyHistoryItem(value);
  submitYtSearch();
}
</script>
