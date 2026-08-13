<template>
  <TrackContextMenu context="yt-search">
    <Scrollable class="flex-1 min-h-0">
      <div
        v-if="isLoading"
        class="flex justify-center py-12"
      >
        <IconLoader class="size-6 animate-spin text-muted-foreground" />
      </div>

      <p
        v-else-if="errorText"
        class="py-12 px-6 text-center text-sm text-destructive"
      >
        {{ errorText }}
      </p>

      <p
        v-else-if="isEmpty"
        class="py-12 px-6 text-center text-sm text-muted-foreground"
      >
        {{ $t("youtube.noResults", { query }) }}
      </p>

      <div
        v-else
        class="flex flex-col gap-5 px-4 py-4"
      >
        <section
          v-if="tracks.length"
          class="flex flex-col gap-1"
        >
          <div class="flex items-center justify-between px-2">
            <h2 class="text-lg font-semibold">
              {{ $t("youtube.chip.tracks") }}
            </h2>
            <Button
              variant="ghost-primary"
              size="sm"
              class="rounded-full text-xs"
              @click="emit('showAll', 'tracks')"
            >
              {{ $t("search.showAll") }}
            </Button>
          </div>
          <YtTrackRow
            v-for="(track, index) in tracks.slice(0, TOP_TRACKS)"
            :key="track.id"
            :item="playableFromMusicTrack(track)"
            :wide="track.isVideo"
            @play="play"
            @contextmenu="openYtMenu(playableFromMusicTrack(track), index)"
          />
        </section>

        <YtCardRow
          v-if="playlists.length"
          :title="$t('youtube.chip.playlists')"
          show-all
          @show-all="emit('showAll', 'playlists')"
        >
          <YtCard
            v-for="playlist in playlists"
            :key="playlist.id"
            :title="playlist.title"
            :subtitle="playlistSubtitle(playlist)"
            :thumbnail="playlist.thumbnail"
            @open="router.push(routeLocation.ytPlaylist(playlist.id))"
          />
        </YtCardRow>

        <YtCardRow
          v-if="albums.length"
          :title="$t('youtube.chip.albums')"
          show-all
          @show-all="emit('showAll', 'albums')"
        >
          <YtCard
            v-for="album in albums"
            :key="album.id"
            :title="album.title"
            :subtitle="albumSubtitle(album)"
            :thumbnail="album.thumbnail"
            @open="router.push(routeLocation.ytAlbum(album.id))"
          />
        </YtCardRow>

        <YtCardRow
          v-if="artists.length"
          :title="$t('youtube.chip.artists')"
          show-all
          @show-all="emit('showAll', 'artists')"
        >
          <YtCard
            v-for="artist in artists"
            :key="artist.id"
            :title="artist.name"
            :thumbnail="artist.thumbnail"
            round
            @open="router.push(routeLocation.ytArtist(artist.id))"
          />
        </YtCardRow>
      </div>
    </Scrollable>
  </TrackContextMenu>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Scrollable } from "@/components/ui/scrollable";
import { routeLocation } from "@/app/router/route-locations";
import type { YtChip } from "@/modules/search/composables/useSearch";
import { useYtSearchAll } from "../../composables/useYtSearchQueries";
import { useYoutube, ytEphemeralTrack } from "../../composables/useYoutube";
import { youtubeErrorMessage } from "../../lib/errors";
import { playableFromMusicTrack } from "../../lib/playable";
import type { YoutubeError, YtMusicAlbum, YtMusicPlaylist, YtPlayable } from "../../types";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import YtCard from "../YtCard.vue";
import YtCardRow from "../YtCardRow.vue";
import YtTrackRow from "../YtTrackRow.vue";
import IconLoader from "~icons/tabler/loader-2";

const TOP_TRACKS = 5;

const props = defineProps<{ query: string }>();

const emit = defineEmits<{
  showAll: [chip: YtChip];
}>();

const { t } = useI18n();
const router = useRouter();
const { play } = useYoutube();
const { openMenu } = useTrackMenu();

function openYtMenu(playable: YtPlayable, index: number) {
  openMenu(ytEphemeralTrack(playable), index, { target: "yt-search" });
}

const { data, isLoading, error } = useYtSearchAll(toRef(props, "query"));

const tracks = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "track" ? [item] : [])),
);
const albums = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "album" ? [item] : [])),
);
const artists = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "artist" ? [item] : [])),
);
const playlists = computed(() =>
  (data.value?.items ?? []).flatMap(item => (item.kind === "playlist" ? [item] : [])),
);

const isEmpty = computed(() => (data.value?.items.length ?? 0) === 0);

const errorText = computed(() =>
  error.value ? youtubeErrorMessage(error.value as unknown as YoutubeError, t) : null,
);

function playlistSubtitle(playlist: YtMusicPlaylist): string | null {
  if (playlist.trackCount != null) {
    return t("youtube.tracksCount", { count: playlist.trackCount });
  }
  return playlist.owner;
}

function albumSubtitle(album: YtMusicAlbum): string | null {
  const artist = album.artists.map(a => a.name).join(", ");
  return [artist, album.year].filter(Boolean).join(" · ") || null;
}
</script>
