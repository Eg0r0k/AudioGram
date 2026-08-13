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
            :key="row.playable.id"
            :track="row.track"
            :cover-url="row.cover"
            hide-index
            :menu-index="index"
            menu-target="yt-search"
            @play="play(row.playable)"
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
import type { PlayerTrack, Track } from "@/modules/player/types";
import type { YtChip } from "@/modules/search/composables/useSearch";
import { useYtSearchAll } from "../../composables/useYtSearchQueries";
import { useYoutube, ytEphemeralTrack } from "../../composables/useYoutube";
import { youtubeErrorMessage } from "../../lib/errors";
import { playableFromMusicTrack } from "../../lib/playable";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../../lib/thumbnail";
import type { YoutubeError, YtPlayable } from "../../types";
import YtEntitySection from "./YtEntitySection.vue";

const TOP_TRACKS = 5;
const TOP_ENTITIES = 4;

const props = defineProps<{ query: string }>();

const emit = defineEmits<{
  showAll: [chip: YtChip];
}>();

const { t } = useI18n();
const { play } = useYoutube();

const { data, isLoading, error } = useYtSearchAll(toRef(props, "query"));

// Ephemeral display tracks are built once per result set so their ids stay
// stable across re-renders (TrackRow/menu identity checks rely on that).
const trackRows = computed(() =>
  (data.value?.items ?? [])
    .flatMap(item => (item.kind === "track" ? [item] : []))
    .slice(0, TOP_TRACKS)
    .map((item) => {
      const playable: YtPlayable = playableFromMusicTrack(item);
      return {
        playable,
        track: ytEphemeralTrack(playable) as PlayerTrack as Track,
        cover: item.thumbnail ? proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW) : undefined,
      };
    }),
);

const albums = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "album" ? [item] : [])).slice(0, TOP_ENTITIES),
);
const artists = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "artist" ? [item] : [])).slice(0, TOP_ENTITIES),
);
const playlists = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "playlist" ? [item] : [])).slice(0, TOP_ENTITIES),
);

const isEmpty = computed(() => (data.value?.items.length ?? 0) === 0);

const errorText = computed(() =>
  error.value ? youtubeErrorMessage(error.value as unknown as YoutubeError, t) : null,
);
</script>
