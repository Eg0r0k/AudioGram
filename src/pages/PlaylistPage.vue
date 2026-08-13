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
              @play="handlePlayAll"
              @shuffle="handleShuffle"
              @edit="showEditDialog = true"
              @delete="openDeleteDialog"
              @add-to-queue="handleAddToQueue"
              @share="handleShare"
            >
              <template #actions>
                <Button
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
import { ref, computed } from "vue";
import { sourceKindOf } from "@/modules/sources/lib/display";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import { Button } from "@/components/ui/button";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconLoader2 from "~icons/tabler/loader-2";
import { PlaylistChanges, usePlaylistPage } from "@/modules/playlist/composables/usePlaylistPage";
import { getPlaylistPageData } from "@/queries/playlist.queries";
import EditPlaylistDialog from "@/modules/playlist/components/dialogs/EditPlaylistDialog.vue";
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
import { useQueueShuffle } from "@/modules/queue/composables/useQueueShuffle";

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
  playlist,
  tracks,
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
  fetchNextPage();
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "playlist" });
}

const errorMessage = computed(() => {
  if (!error.value) return t("errors.unknown");
  if (error.value.message === "Playlist not found") return t("errors.notFound");
  return t("errors.loadFailed");
});

// ND playlist: read-only live page, tracks.value already holds the full
// server list — queue straight from it.
const ndQueueSource = computed(() => {
  const vm = playlistData.value;
  return vm && sourceKindOf(vm.id) === "nd"
    ? { type: "playlist", playlistId: vm.id } as const
    : null;
});

function handlePlayAll() {
  if (ndQueueSource.value) {
    if (tracks.value.length > 0) {
      queueStore.setQueue([...tracks.value], 0, ndQueueSource.value);
    }
    return;
  }
  if (!playlist.value) return;

  getPlaylistPageData(playlist.value.id, sortKey.value).then((data) => {
    if (data && data.tracks.length > 0) {
      queueStore.setQueue(data.tracks, 0, {
        type: "playlist",
        playlistId: playlist.value!.id,
      });
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

  if (ndQueueSource.value) {
    await queueStore.setQueue([...tracks.value], index, ndQueueSource.value);
    return;
  }

  if (!playlist.value) return;

  const data = await getPlaylistPageData(playlist.value.id, sortKey.value);
  const fullIndex = data.tracks.findIndex(track => track.id === selectedTrack.id);
  if (fullIndex === -1) return;

  await queueStore.setQueue(data.tracks, fullIndex, {
    type: "playlist",
    playlistId: playlist.value.id,
  });
}

async function handleShuffle() {
  if (ndQueueSource.value) {
    if (tracks.value.length > 0) {
      await shuffleQueue(ndQueueSource.value, async () => [...tracks.value]);
    }
    return;
  }
  if (!playlist.value) return;

  const source = {
    type: "playlist",
    playlistId: playlist.value.id,
  } as const;
  await shuffleQueue(source, async () => (await getPlaylistPageData(playlist.value!.id, sortKey.value)).tracks);
}

function handleAddToQueue() {
  if (tracks.value.length === 0) return;
  queueStore.addMultipleToQueue(tracks.value);
}

function handleShare() {
  toast.info(t("common.comingSoon"));
}

function openDeleteDialog() {
  if (!playlist.value) return;
  openGlobalDeleteDialog({
    type: "playlist",
    id: playlist.value.id,
    name: playlist.value.name,
    trackCount: trackCount.value,
  }, handleDelete);
}

async function handleDelete() {
  try {
    await deletePlaylist();
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
</script>
