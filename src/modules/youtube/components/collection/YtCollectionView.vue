<template>
  <div class="track-list-grid flex-1 min-h-0 bg-background">
    <div
      v-if="isLoading"
      class="flex items-center justify-center h-full"
    >
      <IconLoader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <p
      v-else-if="errorText && tracks.length === 0"
      class="flex items-center justify-center h-full px-6 text-center text-sm text-destructive"
    >
      {{ errorText }}
    </p>

    <TrackContextMenu
      v-else
      context="yt"
    >
      <VirtualScrollable
        class="h-full"
        :items="tracks"
        :item-height="56"
        :get-item-key="index => tracks[index]?.id ?? index"
        :padding-top="16"
        :padding-bottom="16"
        sticky-offset="72px"
        :loading="isFetchingMore"
        @load-more="emit('loadMore')"
      >
        <template #before>
          <YtCollectionHero
            :title="title"
            :kind="kind"
            :owner="owner"
            :artists="artists"
            :description="description"
            :track-count="trackCount"
            :thumbnail="thumbnail"
            :has-tracks="tracks.length > 0"
            @play="playAll(0)"
            @shuffle="shuffleAll"
            @import="startImport"
            @open-artist="id => router.push(routeLocation.ytArtist(id))"
          />
        </template>

        <template #sticky>
          <LibrarySortHeader
            v-if="tracks.length"
            :sort-key="null"
            :sortable="false"
          />
        </template>

        <template #default="{ item, index }">
          <div class="px-4">
            <TrackExpanded
              :track="displayTracks[index]"
              :index="index + 1"
              :show-cover="kind === 'playlist'"
              :cover-src="item.thumbnail ? proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW) : undefined"
              :is-active="currentYtId === item.id"
              :artist-routes="artistRoutes[index]"
              :album-route="albumRoutes[index]"
              :download-id="dtos[index].id"
              @play="playAll(index)"
              @contextmenu="openYtMenu(index)"
            >
              <template #actions>
                <SourceDownloadButton :dto="dtos[index]" />
              </template>
            </TrackExpanded>
          </div>
        </template>

        <template #loader>
          <div class="flex items-center px-4 flex-col w-full">
            <TrackRowLoading />
          </div>
        </template>
      </VirtualScrollable>
    </TrackContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import { toast } from "vue-sonner";
import { enqueueSourceTracksDownload } from "@/modules/downloads/enqueue";
import { ytEphemeralTrack } from "../../composables/useYoutube";
import { youtubeErrorMessage } from "../../lib/errors";
import { playableFromMusicTrack, ytDisplayTrack, ytMusicTrackToDto, ytPlayableFromEphemeral } from "../../lib/playable";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../../lib/thumbnail";
import type { YoutubeError, YtArtistRef, YtMusicTrack, YtPlayable } from "../../types";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import SourceDownloadButton from "@/modules/downloads/components/SourceDownloadButton.vue";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import YtCollectionHero from "./YtCollectionHero.vue";
import IconLoader2 from "~icons/tabler/loader-2";

const props = defineProps<{
  title: string;
  kind: "playlist" | "album";
  /** Album browse id (MPREb_…) — feeds the yt album id space (M5). */
  collectionId?: string | null;
  owner?: string | null;
  artists?: YtArtistRef[];
  description?: string | null;
  trackCount?: number | null;
  thumbnail?: string | null;
  tracks: YtMusicTrack[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  error?: YoutubeError | null;
}>();

const emit = defineEmits<{
  loadMore: [];
}>();

const { t } = useI18n();
const router = useRouter();
const queue = useQueueStore();
const playerStore = usePlayerStore();

const errorText = computed(() =>
  props.error ? youtubeErrorMessage(props.error, t) : null,
);

const playables = computed<YtPlayable[]>(() =>
  props.tracks.map(track => playableFromMusicTrack(track, props.thumbnail)),
);
// Album pages hand every track the page's album id/title/cover, so the pin
// cascade creates the shadow album (with artwork) alongside the tracks.
const dtos = computed(() => props.tracks.map(track => ytMusicTrackToDto(track, {
  albumId: props.kind === "album" ? props.collectionId : null,
  albumTitle: props.kind === "album" ? props.title : null,
  thumbnail: props.thumbnail,
})));
const displayTracks = computed(() => props.tracks.map(ytDisplayTrack));

// Route rows' artist/album clicks to the YT pages instead of library ones.
const artistRoutes = computed(() =>
  props.tracks.map(track =>
    track.artists.map(a => (a.id ? routeLocation.ytArtist(a.id) : null)),
  ),
);
const albumRoutes = computed(() =>
  props.tracks.map(track =>
    track.album ? routeLocation.ytAlbum(track.album.id) : null,
  ),
);

/** Video id of the currently playing ephemeral YT stream track, if any. */
const currentYtId = computed(() => ytPlayableFromEphemeral(playerStore.currentTrack)?.id ?? null);

const { openMenu } = useTrackMenu();

function openYtMenu(index: number) {
  const playable = playables.value[index];
  if (playable) openMenu(ytEphemeralTrack(playable), index, { target: "yt" });
}

// M5: the hero button queues every loaded track as one batch on the shared
// download manager (pin → job → offline copy). No dialog, no auto-playlist;
// per-row buttons cover partial downloads, progress lives in the storage
// settings' active-downloads row.
async function startImport() {
  try {
    const batchId = await enqueueSourceTracksDownload(dtos.value);
    if (batchId) {
      const total = useDownloadsStore().batches[batchId]?.total ?? 0;
      toast.success(t("media.downloadQueued", { count: total }));
    }
    else {
      toast.info(t("media.nothingToDownload"));
    }
  }
  catch {
    toast.error(t("track.downloadFailed"));
  }
}

/**
 * Streams the collection as an ephemeral queue starting at `startIndex`.
 * `stream://…/yt/…` resolves lazily per track, so the whole queue is built
 * synchronously from loaded tracks — no per-track resolve round-trips.
 */
async function playAll(startIndex: number) {
  if (props.tracks.length === 0) return;
  const queueTracks = playables.value.map(ytEphemeralTrack);
  await queue.setQueue(queueTracks, startIndex, { type: "manual" });
}

async function shuffleAll() {
  await playAll(0);
  if (!queue.isShuffled) {
    queue.toggleShuffle();
  }
}
</script>
