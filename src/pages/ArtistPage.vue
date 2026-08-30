<template>
  <div
    class="track-list-grid flex-1 min-h-0"
  >
    <template v-if="isLoading">
      <div class="flex items-center justify-center h-full">
        <IconLoader2 class="size-8 animate-spin text-muted-foreground" />
      </div>
    </template>

    <template v-else-if="isError">
      <PageErrorState
        :message="errorMessage"
        @retry="refetch"
      />
    </template>

    <template v-else-if="artistData">
      <TrackContextMenu context="artist">
        <VirtualScrollable
          ref="scrollableRef"
          :items="tracks"
          :get-item-key="getTrackKey"
          :item-height="56"
          :padding-top="16"
          :padding-bottom="16"
          sticky-offset="72px"
          :loading="isTracksLoading || isFetchingNextTrackPage"
          class="h-full"
          @load-more="handleTrackLoadMore"
        >
          <template #before>
            <MediaHero
              :data="artistData"
              :has-tracks="tracks.length > 0"
              :is-library-entity="!!artist"
              @play="handlePlayAll"
              @shuffle="handleShuffle"
              @edit="showEditDialog = true"
              @delete="openDeleteDialog"
            >
              <template #actions>
                <Button
                  v-if="artist"
                  class="text-white"
                  variant="ghost"
                  @click="openAddTracksPanel"
                >
                  <IconPlus class="size-5" />
                  {{ $t("track.addTracks") }}
                </Button>
              </template>
            </MediaHero>
            <section
              v-if="albums.length > 0"
              class="p-4"
            >
              <div class="flex items-center justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold">
                    {{ $t('album.album') }}
                  </h2>

                  <p class="text-sm text-muted-foreground">
                    {{ $t('common.albums', { count: albumCount }) }}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  class="shrink-0 rounded-full px-2"
                  @click="router.push(routeLocation.artistAlbums(artistId))"
                >
                  {{ $t('common.viewAll') }}
                  <IconChevronRight class="size-4" />
                </Button>
              </div>

              <LibraryContextMenu @delete="deleteLibraryItem">
                <ScrollableSlider
                  class="mt-3"
                >
                  <AlbumItem
                    v-for="albumItem in albumItems"
                    :key="albumItem.id"
                    :item="albumItem"
                    @play="playAlbum"
                  />
                </ScrollableSlider>
              </LibraryContextMenu>
            </section>

            <section
              v-if="playlistItems.length > 0"
              class="px-4 pb-4"
            >
              <h2 class="text-xl font-semibold">
                {{ $t('media.type.playlist') }}
              </h2>

              <LibraryContextMenu @delete="deleteLibraryItem">
                <ScrollableSlider class="mt-3">
                  <AlbumItem
                    v-for="playlistItem in playlistItems"
                    :key="playlistItem.id"
                    :item="playlistItem"
                    @play="playAlbum"
                  />
                </ScrollableSlider>
              </LibraryContextMenu>
            </section>
          </template>

          <template #sticky>
            <LibrarySortHeader
              v-model:sort-key="sortKey"
            />
          </template>

          <template #default="{ item, index }">
            <div class="px-4">
              <TrackExpanded
                :track="item"
                :index="index + 1"
                :is-active="currentTrackId === item.id"
                menu-target="artist"
                @play="handlePlayTrack(index)"
                @contextmenu="handleContextMenu(item, index)"
              />
            </div>
          </template>

          <template #loader>
            <div class="flex items-center px-4 flex-col w-full">
              <TrackRowLoading />
            </div>
          </template>
        </VirtualScrollable>
      </TrackContextMenu>

      <TrackDropdown context="artist" />
      <EditArtistDialog
        v-model:open="showEditDialog"
        :artist="artist"
        :current-cover-url="coverUrl"
        @save="handleSave"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconChevronRight from "~icons/tabler/chevron-right";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlus from "~icons/tabler/plus";

import { sourceKindOf } from "@/modules/sources/lib/display";
import { useArtistPage } from "@/modules/artists/composables/useArtistPage";
import { getArtistPageData } from "@/queries/artist.queries";
import MediaHero from "@/modules/media-hero/components/MediaHero.vue";
import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog.vue";
import type { DeleteConfirmResult } from "@/components/dialogs/deleteConfirm";
import { summonDialog } from "@/components/dialogs/summon";
import EditArtistDialog from "@/modules/artists/components/dialogs/EditArtistDialog.vue";
import type { ArtistChanges } from "@/modules/artists/composables/useArtistPage";
import type { TrackSortKey } from "@/modules/tracks/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { Track } from "@/modules/player/types";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import AlbumItem from "@/modules/albums/components/AlbumItem.vue";
import { usePlayAlbum } from "@/modules/albums/composables/usePlayAlbum";
import { ScrollableSlider } from "@/components/ui/scrollable";
import { routeLocation } from "@/app/router/route-locations";
import type { LibraryItem } from "@/modules/library/types";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import { useQueueShuffle } from "@/modules/queue/composables/useQueueShuffle";
import { Button } from "@/components/ui/button";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useRoute, useRouter } from "vue-router";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";

const { t } = useI18n();
const queueStore = useQueueStore();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const route = useRoute();
const router = useRouter();
const { openMenu } = useTrackMenu();
const { isPinned, deleteItem: deleteLibraryItem } = useLibrary();
const { playAlbum } = usePlayAlbum();
const shuffleQueue = useQueueShuffle();
const sortKey = ref<TrackSortKey | null>(null);
const artistId = computed(() => route.params.id as string);

const {
  artist,
  albums,
  albumCovers,
  playlistItems,
  tracks,
  artistData,
  coverUrl,
  trackCount,
  albumCount,
  isLoading,
  error,
  isError,
  deleteArtist,
  updateArtist,
  refetch,
  fetchNextTrackPage,
  hasNextTrackPage,
  isTracksLoading,
  isFetchingNextTrackPage,
} = useArtistPage(sortKey);

const showEditDialog = ref(false);
const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

const albumItems = computed<LibraryItem[]>(() => albums.value.map(album => ({
  id: album.id,
  type: "album",
  title: album.title,
  image: albumCovers.value.get(album.id),
  subtitle: artist.value?.name,
  isPinned: isPinned("album", album.id),
  addedAt: album.addedAt,
  updatedAt: album.updatedAt,
  artistName: artist.value?.name,
  to: routeLocation.album(album.id),
  rounded: false,
  // A catalog artist page lists catalog albums: no Dexie rows behind them.
  isCatalog: !artist.value,
})));

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function handleTrackLoadMore() {
  if (!hasNextTrackPage.value || isFetchingNextTrackPage.value) return;
  fetchNextTrackPage();
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "artist" });
}

const errorMessage = computed(() => {
  if (!error.value) return t("errors.unknown");
  const message = error.value.message;
  if (message === "Artist not found") return t("errors.notFound");
  return t("errors.loadFailed");
});

// Catalog artist: no Dexie rows to page through, but tracks.value already
// holds the top tracks getArtist returned — queue straight from them.
const remoteQueueSource = computed(() => {
  const vm = artistData.value;
  return vm && sourceKindOf(vm.id) !== "local"
    ? { type: "artist", artistId: vm.id } as const
    : null;
});

function handlePlayAll() {
  if (remoteQueueSource.value) {
    if (tracks.value.length > 0) {
      queueStore.setQueue([...tracks.value], 0, remoteQueueSource.value);
    }
    return;
  }
  if (!artist.value) return;

  getArtistPageData(artist.value.id, sortKey.value).then((data) => {
    if (data && data.tracks.length > 0) {
      queueStore.setQueue(data.tracks, 0, { type: "artist", artistId: artist.value!.id });
    }
  });
}

async function handlePlayTrack(index: number) {
  const selectedTrack = tracks.value[index];
  if (!selectedTrack) return;

  if (currentTrackId.value === selectedTrack.id) {
    playerStore.togglePlay();
    return;
  }

  if (remoteQueueSource.value) {
    await queueStore.setQueue([...tracks.value], index, remoteQueueSource.value);
    return;
  }

  if (!artist.value) return;
  const data = await getArtistPageData(artist.value.id, sortKey.value);
  const fullIndex = data.tracks.findIndex(track => track.id === selectedTrack.id);
  if (fullIndex === -1) return;

  await queueStore.setQueue(data.tracks, fullIndex, { type: "artist", artistId: artist.value.id });
}

async function handleShuffle() {
  if (remoteQueueSource.value) {
    if (tracks.value.length > 0) {
      await shuffleQueue(remoteQueueSource.value, async () => [...tracks.value]);
    }
    return;
  }
  if (!artist.value) return;

  const source = { type: "artist", artistId: artist.value.id } as const;
  await shuffleQueue(source, async () => (await getArtistPageData(artist.value!.id, sortKey.value)).tracks);
}

async function openDeleteDialog() {
  if (!artist.value) return;

  const result = await summonDialog<DeleteConfirmResult>(DeleteConfirmDialog, {
    data: {
      type: "artist",
      id: artist.value.id,
      name: artist.value.name,
      trackCount: trackCount.value,
    },
  }, { key: `delete:${artist.value.id}` });
  if (result) await handleDelete(result.deleteTracks);
}

async function handleDelete(deleteTracks: boolean) {
  try {
    await deleteArtist({ deleteTracks });
  }
  catch {
    toast.error(t("artist.deleteFailed"));
  }
}

async function handleSave(changes: ArtistChanges) {
  try {
    await updateArtist(changes);
    showEditDialog.value = false;
  }
  catch (e) {
    const message = e instanceof Error ? e.message : t("errors.loadFailed");
    toast.error(message);
  }
}

const openAddTracksPanel = () => {
  if (!artist.value) return;

  rightPanelStore.openAddTracks({
    entityType: "artist",
    entityId: artist.value.id,
    onConfirmed: () => refetch(),
  }, {
    scope: { type: "route", routeKey: route.fullPath },
    depth: 1,
  });
};

const scrollableRef = useTemplateRef("scrollableRef");
// Declared after the page state it reads: the hook evaluates `ready`
// immediately, so placing this any earlier hits the temporal dead zone.
useScrollRestoration(scrollableRef, {
  key: () => `artist:${route.params.id}`,
  ready: () => !isLoading.value,
  deps: () => tracks.value.length,
});

</script>
