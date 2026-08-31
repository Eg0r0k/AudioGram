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
            ref="scrollableRef"
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
                :is-library-entity="!!album"
                @play="handlePlayAll"
                @shuffle="handleShuffle"
                @edit="showEditDialog = true"
                @delete="openDeleteDialog"
                @add-to-queue="handleAddToQueue"
              >
                <template #actions>
                  <Button
                    v-if="album"
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
              <LibrarySortHeader
                v-model:sort-key="sortKey"
                :sortable="canSort"
              />
            </template>

            <template #default="{ item, index }">
              <div class="px-4">
                <TrackExpanded
                  :show-cover="false"
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
import { sourceKindOf } from "@/modules/sources/lib/display";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import { onKeyStroke } from "@vueuse/core";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import { Button } from "@/components/ui/button";
import { useEntityPlayback } from "@/modules/queue/composables/useEntityPlayback";
import type { QueueSource } from "@/modules/queue/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconLoader2 from "~icons/tabler/loader-2";
import { useAlbumPage } from "@/modules/albums/composables/useAlbumPage";
import { getAlbumPageData } from "@/queries/album.queries";
import EditAlbumDialog from "@/modules/albums/components/dialogs/EditAlbumDialog.vue";
import MediaHero from "@/modules/media-hero/components/MediaHero.vue";
import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import DeleteConfirmDialog from "@/components/dialogs/DeleteConfirmDialog.vue";
import type { DeleteConfirmResult } from "@/components/dialogs/deleteConfirm";
import { summonDialog } from "@/components/dialogs/summon";
import IconPlus from "~icons/tabler/plus";
import type { TrackSortKey } from "@/modules/tracks/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { Track } from "@/modules/player/types";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useTrackSelection } from "@/modules/tracks/composables/useTrackSelection";
import { getLogger } from "@/lib/logger";

interface AlbumChanges {
  title?: string;
  description?: string;
  coverBlob?: Blob;
  removeCover?: boolean;
}

const { t } = useI18n();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const { openMenu } = useTrackMenu();
const route = useRoute();
const sortKey = ref<TrackSortKey | null>(null);

const {
  album,
  tracks,
  canSort,
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

onKeyStroke("Escape", (event) => {
  if (!isSelecting.value) return;
  event.preventDefault();
  clearSelection();
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
  // The query keeps its own error state for the UI; the log is what tells us
  // WHY a scroll stopped loading more album tracks.
  fetchNextPage().catch((err: unknown) => {
    getLogger().warn(`[AlbumPage] Loading the next album tracks page failed: ${String(err)}`);
  });
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "album" });
}

const queueSource = computed<QueueSource | null>(() => {
  const vm = albumData.value;
  return vm ? { type: "album", albumId: vm.id } : null;
});

const {
  playAll: handlePlayAll,
  playTrack: handlePlayTrack,
  shuffle: handleShuffle,
  addToQueue: handleAddToQueue,
} = useEntityPlayback({
  tracks,
  source: queueSource,
  // The catalog path has no Dexie rows to page through — getAlbum handed the
  // album over whole, already in the page's sort order.
  isComplete: computed(() => !album.value),
  loadAll: async () => {
    const row = album.value;
    if (!row) return [];
    return (await getAlbumPageData(row.id, sortKey.value)).tracks;
  },
});

async function openDeleteDialog() {
  if (!album.value) return;
  const result = await summonDialog<DeleteConfirmResult>(DeleteConfirmDialog, {
    data: {
      type: "album",
      id: album.value.id,
      name: album.value.title,
      trackCount: trackCount.value,
      defaultDeleteTracks: sourceKindOf(album.value.id) !== "local",
    },
  }, { key: `delete:${album.value.id}` });
  if (result) await handleDelete(result.deleteTracks);
}

async function handleDelete(deleteTracks: boolean) {
  try {
    await deleteAlbum({ deleteTracks });
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

const scrollableRef = useTemplateRef("scrollableRef");
// Declared after the page state it reads: the hook evaluates `ready`
// immediately, so placing this any earlier hits the temporal dead zone.
useScrollRestoration(scrollableRef, {
  key: () => `album:${String(route.params.id)}`,
  ready: () => !isLoading.value,
  deps: () => tracks.value.length,
});

</script>
