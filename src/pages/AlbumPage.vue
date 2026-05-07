<template>
  <div
    ref="tracksListRef"
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

    <template v-else-if="albumData">
      <TrackContextMenu
        context="album"
        :album-id="album?.id"
      >
        <div
          class="h-full"
        >
          <VirtualScrollable
            :items="tracks"
            :get-item-key="getTrackKey"
            :item-height="56"
            :load-more-offset="120"
            :padding-top="16"
            :padding-bottom="16"
            sticky-offset="72px"
            :loading="isTracksLoading || isFetchingNextPage"
            class="h-full"
            @load-more="handleLoadMore"
          >
            <template #before>
              <MediaHero
                :data="albumData"
                :has-tracks="tracks.length > 0"
                @play="handlePlayAll"
                @shuffle="handleShuffle"
                @edit="showEditDialog = true"
                @delete="openDeleteDialog"
                @add-to-queue="handleAddToQueue"
              >
                <template #actions>
                  <Button
                    class="text-white"
                    variant="ghost"
                    @click="openAddTracksPanel"
                  >
                    <IconPlus class="size-5" />
                    {{ $t("track.addTracks") }}
                  </Button>
                </template>
              </MediaHero>
            </template>

            <template #sticky>
              <!-- <TrackSelectionBar
                key="selection"
                :selected-count="selectedCount"
                can-delete
                @cancel="clearSelection"
                @select-all="selectAll"
              /> -->
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
                  :is-selected="isSelected(item.id)"
                  :is-selecting="isSelecting"
                  menu-target="album"
                  @play="handlePlayTrack(index)"
                  @select="(track, event) => handleTrackSelect(track, event)"
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
        </div>
      </TrackContextMenu>

      <TrackDropdown
        context="album"
        :album-id="album?.id"
      />
    </template>

    <EditAlbumDialog
      v-model:open="showEditDialog"
      :album="album"
      :current-cover-url="coverUrl"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef, watch } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { onKeyStroke } from "@vueuse/core";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import { Button } from "@/components/ui/button";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconLoader2 from "~icons/tabler/loader-2";
import { useAlbumPage } from "@/modules/albums/composables/useAlbumPage";
import { getAlbumPageData } from "@/queries/album.queries";
import EditAlbumDialog from "@/modules/albums/components/dialogs/EditAlbumDialog.vue";
import MediaHero from "@/modules/media-hero/components/MediaHero.vue";
import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import { useDeleteConfirmDialog } from "@/composables/useDeleteConfirmDialog";
import IconPlus from "~icons/tabler/plus";
import type { TrackSortKey } from "@/modules/tracks/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { Track } from "@/modules/player/types";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useTrackSelection } from "@/modules/tracks/composables/useTrackSelection";
import { useQueueShuffle } from "@/modules/queue/composables/useQueueShuffle";

interface AlbumChanges {
  title?: string;
  description?: string;
  coverBlob?: Blob;
  removeCover?: boolean;
}

const { t } = useI18n();
const queueStore = useQueueStore();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const { openDeleteDialog: openGlobalDeleteDialog } = useDeleteConfirmDialog();
const { openMenu } = useTrackMenu();
const shuffleQueue = useQueueShuffle();
const route = useRoute();
const sortKey = ref<TrackSortKey | null>(null);

const {
  album,
  tracks,
  albumData,
  coverUrl,
  trackCount,
  isLoading,
  isError,
  error,
  deleteAlbum,
  updateAlbum,
  refetch,
  fetchNextPage,
  hasNextPage,
  isTracksLoading,
  isFetchingNextPage,
} = useAlbumPage(sortKey);

const tracksListRef = useTemplateRef<HTMLElement>("tracksListRef");

const {
  isSelecting,
  isSelected,
  clearSelection,
  handleTrackSelect,
} = useTrackSelection(tracks, tracksListRef);

watch(() => route.params.id, () => clearSelection());

// ESC cancels selection
onKeyStroke("Escape", () => {
  if (isSelecting.value) clearSelection();
});

const showEditDialog = ref(false);
const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

const errorMessage = computed(() => {
  if (!error.value) return t("errors.unknown");
  if (error.value.message === "Album not found") return t("errors.notFound");
  return t("errors.loadFailed");
});

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function openAddTracksPanel() {
  if (!album.value) return;
  rightPanelStore.openAddTracks(
    { entityType: "album", entityId: album.value.id, onConfirmed: () => refetch() },
    { scope: { type: "route", routeKey: route.fullPath }, depth: 1 },
  );
}

function handleLoadMore() {
  if (!hasNextPage.value || isFetchingNextPage.value) return;
  fetchNextPage();
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "album" });
}

function handlePlayAll() {
  if (!album.value) return;
  getAlbumPageData(album.value.id, sortKey.value).then((data) => {
    if (data?.tracks.length) {
      queueStore.setQueue(data.tracks, 0, { type: "album", albumId: album.value!.id });
    }
  });
}

async function handlePlayTrack(index: number) {
  if (!album.value) return;
  const selectedTrack = tracks.value[index];
  if (!selectedTrack) return;

  if (currentTrackId.value === selectedTrack.id) {
    playerStore.togglePlay();
    return;
  }

  const data = await getAlbumPageData(album.value.id, sortKey.value);
  const fullIndex = data.tracks.findIndex(t => t.id === selectedTrack.id);
  if (fullIndex === -1) return;

  await queueStore.setQueue(data.tracks, fullIndex, { type: "album", albumId: album.value.id });
}

function handleAddToQueue() {
  if (tracks.value.length === 0) return;
  queueStore.addMultipleToQueue(tracks.value);
}

function openDeleteDialog() {
  if (!album.value) return;
  openGlobalDeleteDialog({
    type: "album",
    id: album.value.id,
    name: album.value.title,
    trackCount: trackCount.value,
  }, handleDelete);
}

async function handleDelete() {
  try {
    await deleteAlbum();
    toast.success(t("album.deleted"));
  }
  catch {
    toast.error(t("album.deleteFailed"));
  }
}

async function handleSave(changes: AlbumChanges) {
  try {
    await updateAlbum(changes);
    showEditDialog.value = false;
  }
  catch (e) {
    const message = e instanceof Error ? e.message : t("album.updateFailed");
    toast.error(message);
  }
}

async function handleShuffle() {
  if (!album.value) return;
  const source = { type: "album", albumId: album.value.id } as const;
  await shuffleQueue(source, async () => (await getAlbumPageData(album.value!.id, sortKey.value)).tracks);
}
</script>
