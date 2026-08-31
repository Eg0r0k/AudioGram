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

    <template v-else-if="playlistData">
      <TrackContextMenu
        context="playlist"
        :playlist-id="playlist?.id"
        :is-playlist-owner="playlistData?.isOwner ?? true"
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
              :data="playlistData"
              :has-tracks="tracks.length > 0"
              :is-library-entity="!!playlist"
              @play="handlePlayAll"
              @shuffle="handleShuffle"
              @edit="showEditDialog = true"
              @delete="openDeleteDialog"
              @add-to-queue="handleAddToQueue"
              @share="handleShare"
            >
              <template #actions>
                <Button
                  v-if="playlist"
                  variant="ghost"
                  class="text-white"
                  @click="openAddTracksPanel"
                >
                  <IconPlus class="size-5" />
                  {{ $t("playlist.addTracks") }}
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
                :track="item"
                :index="index + 1"
                :is-active="currentTrackId === item.id"
                menu-target="playlist"
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
          <template
            #empty
          >
            <div class="p-4">
              <Button
                size="lg"
                variant="secondary"
                class="w-full rounded-full"
                @click="openAddTracksPanel"
              >
                <IconPlus class="size-5" />
                {{ $t("playlist.addTracks") }}
              </Button>
            </div>
          </template>
        </VirtualScrollable>
      </TrackContextMenu>

      <TrackDropdown
        context="playlist"
        :playlist-id="playlist?.id"
        :is-playlist-owner="playlistData?.isOwner ?? true"
      />
    </template>

    <EditPlaylistDialog
      v-model:open="showEditDialog"
      :playlist="playlist"
      :current-cover-url="coverUrl"
      @save="handleSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import { Button } from "@/components/ui/button";
import { useEntityPlayback } from "@/modules/queue/composables/useEntityPlayback";
import type { QueueSource } from "@/modules/queue/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconLoader2 from "~icons/tabler/loader-2";
import type { PlaylistChanges } from "@/modules/playlist/composables/usePlaylistPage";
import { usePlaylistPage } from "@/modules/playlist/composables/usePlaylistPage";
import EditPlaylistDialog from "@/modules/playlist/components/dialogs/EditPlaylistDialog.vue";
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
import { getLogger } from "@/lib/logger";

const { t } = useI18n();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const { openMenu } = useTrackMenu();
const route = useRoute();
const sortKey = ref<TrackSortKey | null>(null);

const {
  playlist,
  tracks,
  canSort,
  isComplete,
  loadAllTracks,
  playlistData,
  isLoading,
  isError,
  coverUrl,
  trackCount,
  error,
  deletePlaylist,
  updatePlaylist,
  refetch,
  fetchNextPage,
  hasNextPage,
  isTracksLoading,
  isFetchingNextPage,
} = usePlaylistPage(sortKey);

const showEditDialog = ref(false);
const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function openAddTracksPanel() {
  if (!playlist.value) return;

  rightPanelStore.openAddTracks({
    entityType: "playlist",
    entityId: playlist.value.id,
    onConfirmed: () => refetch(),
  }, {
    scope: { type: "route", routeKey: route.fullPath },
    depth: 1,
  });
}

function handleLoadMore() {
  if (!hasNextPage.value || isFetchingNextPage.value) return;
  // The query keeps its own error state for the UI; the log is what tells us
  // WHY a scroll stopped loading more playlist tracks.
  fetchNextPage().catch((err: unknown) => {
    getLogger().warn(`[PlaylistPage] Loading the next playlist tracks page failed: ${String(err)}`);
  });
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "playlist" });
}

const errorMessage = computed(() => {
  if (!error.value) return t("errors.unknown");
  if (error.value.message === "Playlist not found") return t("errors.notFound");
  return t("errors.loadFailed");
});

const queueSource = computed<QueueSource | null>(() => {
  const vm = playlistData.value;
  return vm ? { type: "playlist", playlistId: vm.id } : null;
});

const {
  playAll: handlePlayAll,
  playTrack: handlePlayTrack,
  shuffle: handleShuffle,
  addToQueue: handleAddToQueue,
} = useEntityPlayback({
  tracks,
  source: queueSource,
  isComplete,
  loadAll: loadAllTracks,
});

function handleShare() {
  toast.info(t("common.comingSoon"));
}

async function openDeleteDialog() {
  if (!playlist.value) return;
  const result = await summonDialog<DeleteConfirmResult>(DeleteConfirmDialog, {
    data: {
      type: "playlist",
      id: playlist.value.id,
      name: playlist.value.name,
      trackCount: trackCount.value,
    },
  }, { key: `delete:${playlist.value.id}` });
  if (result) await handleDelete(result.deleteTracks);
}

async function handleDelete(deleteTracks: boolean) {
  try {
    await deletePlaylist({ deleteTracks });
  }
  catch {
    toast.error(t("playlist.deleteFailed"));
  }
}

async function handleSave(changes: PlaylistChanges) {
  try {
    await updatePlaylist(changes);
    showEditDialog.value = false;
  }
  catch (e) {
    const message = e instanceof Error ? e.message : t("playlist.updateFailed");
    toast.error(message);
  }
}

const scrollableRef = useTemplateRef("scrollableRef");
// Declared after the page state it reads: the hook evaluates `ready`
// immediately, so placing this any earlier hits the temporal dead zone.
useScrollRestoration(scrollableRef, {
  key: () => `playlist:${String(route.params.id)}`,
  ready: () => !isLoading.value,
  deps: () => tracks.value.length,
});

</script>
