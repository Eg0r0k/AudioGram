<template>
  <div class="track-list-grid flex-1 min-h-0 bg-background">
    <div
      v-if="isLoading"
      class="flex items-center justify-center h-full"
    >
      <IconLoader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <p
      v-else-if="errorText"
      class="flex items-center justify-center h-full px-6 text-center text-sm text-destructive"
    >
      {{ errorText }}
    </p>

    <TrackContextMenu
      v-else-if="artist"
      context="yt"
    >
      <VirtualScrollable
        class="h-full"
        :items="artist.topTracks"
        :item-height="56"
        :get-item-key="index => artist?.topTracks[index]?.id ?? index"
        :padding-top="16"
        :padding-bottom="16"
        sticky-offset="72px"
      >
        <template #before>
          <div class="relative @container">
            <div
              class="absolute inset-0 transition-opacity duration-400 ease-standard pointer-events-none"
              :class="colorReady ? 'opacity-100' : 'opacity-0'"
              :style="{ background: `linear-gradient(${color.hsl} 0%, transparent 140%)` }"
            />

            <MediaHeader
              :title="artist.name"
              :color="colorReady ? color.hsl : null"
              @play="playTopTracks(0)"
            />

            <div class="relative flex min-h-[265px] flex-col items-center gap-5 px-4 pb-6 pt-[72px] text-center @lg:flex-row @lg:items-end @lg:gap-7 @lg:px-7 @lg:pb-7 @lg:text-left">
              <div class="w-full max-w-44 mb-auto shrink-0 @sm:max-w-52 @lg:max-w-[232px]">
                <MediaHeroImage
                  :src="imageSrc"
                  :alt="artist.name"
                  rounded
                  fallback-src="/img/artist-fallback.svg"
                />
              </div>

              <div class="flex select-none min-w-0 w-full flex-col items-center text-white @lg:items-start">
                <span class="mb-1 text-xs font-medium opacity-90 @sm:text-sm">
                  {{ $t("media.type.artist") }}
                </span>

                <h1 class="w-full wrap-break-word text-balance font-black leading-none tracking-tight text-3xl @sm:text-4xl @md:text-5xl @xl:text-6xl">
                  {{ artist.name }}
                </h1>

                <p
                  v-if="artist.subscriberCount"
                  class="mt-3 text-sm font-medium text-white/90"
                >
                  {{ $t("youtube.subscribers", { count: formattedSubscribers }) }}
                </p>

                <div class="mt-5 w-full @lg:mt-6">
                  <div class="flex flex-wrap items-center justify-center gap-3 @lg:justify-start">
                    <Button
                      class="size-14 rounded-full"
                      :disabled="artist.topTracks.length === 0"
                      @click="playTopTracks(0)"
                    >
                      <IconPlay class="size-5 fill-current" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="artist.albums.length || artist.playlists.length"
            class="flex flex-col gap-5 px-4 py-5"
          >
            <YtCardRow
              v-if="artist.albums.length"
              :title="$t('youtube.chip.albums')"
            >
              <YtCard
                v-for="album in artist.albums"
                :key="album.id"
                :title="album.title"
                :subtitle="album.year ? String(album.year) : null"
                :thumbnail="album.thumbnail"
                @open="router.push(routeLocation.ytAlbum(album.id))"
              />
            </YtCardRow>

            <YtCardRow
              v-if="artist.playlists.length"
              :title="$t('youtube.chip.playlists')"
            >
              <YtCard
                v-for="playlist in artist.playlists"
                :key="playlist.id"
                :title="playlist.title"
                :subtitle="playlist.owner"
                :thumbnail="playlist.thumbnail"
                @open="router.push(routeLocation.ytPlaylist(playlist.id))"
              />
            </YtCardRow>
          </div>

          <h2
            v-if="artist.topTracks.length"
            class="px-7 pb-1 text-lg font-semibold"
          >
            {{ $t("youtube.topTracks") }}
          </h2>
        </template>

        <template #sticky>
          <LibrarySortHeader
            v-if="artist.topTracks.length"
            :sort-key="null"
            :sortable="false"
          />
        </template>

        <template #default="{ item, index }">
          <div class="px-4">
            <TrackExpanded
              :track="displayTracks[index]"
              :index="index + 1"
              :cover-src="item.thumbnail ? proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW) : undefined"
              :is-active="currentYtId === item.id"
              :artist-routes="artistRoutes[index]"
              :album-route="albumRoutes[index]"
              :download-id="dtos[index].id"
              @play="playTopTracks(index)"
              @contextmenu="openYtMenu(index)"
            >
              <template #actions>
                <SourceDownloadButton :dto="dtos[index]" />
              </template>
            </TrackExpanded>
          </div>
        </template>
      </VirtualScrollable>
    </TrackContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import { useImageColor } from "@/composables/useImageColor";
import { routeLocation } from "@/app/router/route-locations";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import MediaHeader from "@/modules/media-hero/components/MediaHeader.vue";
import MediaHeroImage from "@/modules/media-hero/components/MediaHeroImage.vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import SourceDownloadButton from "@/modules/downloads/components/SourceDownloadButton.vue";
import YtCard from "@/modules/youtube/components/YtCard.vue";
import YtCardRow from "@/modules/youtube/components/YtCardRow.vue";
import { ytEphemeralTrack } from "@/modules/youtube/composables/useYoutube";
import { useYtArtist } from "@/modules/youtube/composables/useYtSearchQueries";
import { youtubeErrorMessage } from "@/modules/youtube/lib/errors";
import { playableFromMusicTrack, ytDisplayTrack, ytMusicTrackToDto, ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "@/modules/youtube/lib/thumbnail";
import type { YoutubeError } from "@/modules/youtube/types";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlay from "~icons/audiogram/play-rounded";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const queue = useQueueStore();
const playerStore = usePlayerStore();

const artistId = computed(() => String(route.params.id ?? ""));
const { data: artist, isLoading, error } = useYtArtist(artistId);

const errorText = computed(() =>
  error.value ? youtubeErrorMessage(error.value as unknown as YoutubeError, t) : null,
);

const playables = computed(() => (artist.value?.topTracks ?? []).map(track => playableFromMusicTrack(track)));
const dtos = computed(() => (artist.value?.topTracks ?? []).map(track => ytMusicTrackToDto(track)));
const displayTracks = computed(() => (artist.value?.topTracks ?? []).map(ytDisplayTrack));

// Route rows' artist/album clicks to the YT pages instead of library ones.
const artistRoutes = computed(() =>
  (artist.value?.topTracks ?? []).map(track =>
    track.artists.map(a => (a.id ? routeLocation.ytArtist(a.id) : null)),
  ),
);
const albumRoutes = computed(() =>
  (artist.value?.topTracks ?? []).map(track =>
    track.album ? routeLocation.ytAlbum(track.album.id) : null,
  ),
);

const imageSrc = computed(() =>
  artist.value?.thumbnail ? proxiedThumbnail(artist.value.thumbnail) : "/img/artist-fallback.svg",
);

const formattedSubscribers = computed(() =>
  new Intl.NumberFormat().format(artist.value?.subscriberCount ?? 0),
);

const currentYtId = computed(() => ytPlayableFromEphemeral(playerStore.currentTrack)?.id ?? null);

const { openMenu } = useTrackMenu();

function openYtMenu(index: number) {
  const playable = playables.value[index];
  if (playable) openMenu(ytEphemeralTrack(playable, dtos.value[index]), index, { target: "yt" });
}

async function playTopTracks(startIndex: number) {
  if (playables.value.length === 0) return;
  const queueTracks = playables.value.map((playable, index) =>
    ytEphemeralTrack(playable, dtos.value[index]));
  await queue.setQueue(queueTracks, startIndex, { type: "manual" });
}

const { color, extractColor, resetColor } = useImageColor();
const colorReady = ref(false);

watch(
  () => imageSrc.value,
  async (newImage, oldImage) => {
    if (newImage === oldImage) return;

    colorReady.value = false;
    await nextTick();

    if (newImage && newImage !== "/img/artist-fallback.svg") {
      await extractColor(newImage);
    }
    else {
      resetColor();
    }

    colorReady.value = true;
  },
  { immediate: true },
);
</script>
