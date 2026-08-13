<template>
  <TrackContextMenu context="yt-search">
    <VirtualScrollable
      class="flex-1 min-h-0"
      :items="entities"
      :estimate-size="64"
      :get-item-key="index => entities[index]?.id ?? index"
      :loading="isLoading || isFetchingNextPage"
      @load-more="onLoadMore"
    >
      <template #default="{ item, index }">
        <div class="px-4">
          <YtTrackRow
            v-if="item.kind === 'track'"
            :item="playableFromMusicTrack(item)"
            :wide="item.isVideo"
            @play="play"
            @contextmenu="openYtMenu(playableFromMusicTrack(item), index)"
          />
          <Item
            v-else
            as="button"
            type="button"
            size="sm"
            class="w-full cursor-pointer gap-3 rounded-lg p-2 text-left hover:bg-muted/60"
            @click="openEntity(item)"
          >
            <ItemMedia
              class="size-12 overflow-hidden bg-muted"
              :class="item.kind === 'artist' ? 'rounded-full' : 'rounded'"
            >
              <img
                v-if="entityThumbnail(item)"
                :src="proxiedThumbnail(entityThumbnail(item)!, THUMB_SIZE_ROW)"
                alt=""
                loading="lazy"
                class="h-full w-full object-cover"
              >
              <IconMusic
                v-else
                class="size-6 text-muted-foreground"
              />
            </ItemMedia>
            <ItemContent class="min-w-0">
              <ItemTitle class="block min-w-0 w-full! overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {{ entityTitle(item) }}
              </ItemTitle>
              <ItemDescription
                v-if="entitySubtitle(item)"
                class="line-clamp-1 text-xs"
              >
                {{ entitySubtitle(item) }}
              </ItemDescription>
            </ItemContent>
          </Item>
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
        <p
          v-else
          class="py-12 px-6 text-center text-sm text-muted-foreground"
        >
          {{ $t("youtube.noResults", { query }) }}
        </p>
      </template>
    </VirtualScrollable>
  </TrackContextMenu>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { routeLocation } from "@/app/router/route-locations";
import { useYtSearchList, type YtListChip } from "../../composables/useYtSearchQueries";
import { useYoutube, ytEphemeralTrack } from "../../composables/useYoutube";
import { youtubeErrorMessage } from "../../lib/errors";
import { playableFromMusicTrack } from "../../lib/playable";
import type { YoutubeError, YtMusicEntity, YtPlayable } from "../../types";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../../lib/thumbnail";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import YtTrackRow from "../YtTrackRow.vue";
import IconLoader from "~icons/tabler/loader-2";
import IconMusic from "~icons/tabler/music";

const props = defineProps<{
  chip: YtListChip;
  query: string;
}>();

const { t } = useI18n();
const router = useRouter();
const { play } = useYoutube();
const { openMenu } = useTrackMenu();

function openYtMenu(playable: YtPlayable, index: number) {
  openMenu(ytEphemeralTrack(playable), index, { target: "yt-search" });
}

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

const errorText = computed(() =>
  error.value ? youtubeErrorMessage(error.value as unknown as YoutubeError, t) : null,
);

function onLoadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) {
    void fetchNextPage();
  }
}

function openEntity(item: YtMusicEntity) {
  if (item.kind === "album") {
    router.push(routeLocation.ytAlbum(item.id));
  }
  else if (item.kind === "playlist") {
    router.push(routeLocation.ytPlaylist(item.id));
  }
  else if (item.kind === "artist") {
    router.push(routeLocation.ytArtist(item.id));
  }
}

function entityTitle(item: YtMusicEntity): string {
  return item.kind === "artist" ? item.name : item.title;
}

function entityThumbnail(item: YtMusicEntity): string | null {
  return item.thumbnail;
}

function entitySubtitle(item: YtMusicEntity): string | null {
  switch (item.kind) {
    case "album": {
      const artist = item.artists.map(a => a.name).join(", ");
      return [artist, item.year].filter(Boolean).join(" · ") || null;
    }
    case "playlist":
      return item.trackCount != null
        ? t("youtube.tracksCount", { count: item.trackCount })
        : item.owner;
    case "artist":
      return t("youtube.chip.artists");
    default:
      return null;
  }
}
</script>
