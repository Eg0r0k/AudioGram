<template>
  <div
    class="track-list-grid flex-1 min-h-0"
  >
    <template v-if="isLoading">
      <div class="flex h-full items-center justify-center">
        <IconLoader2 class="size-8 animate-spin text-muted-foreground" />
      </div>
    </template>

    <template v-else-if="isError">
      <PageErrorState
        :message="$t('errors.loadFailed')"
        @retry="refetch"
      />
    </template>

    <template v-else>
      <TrackContextMenu context="liked">
        <VirtualScrollable
          :items="tracks"
          :get-item-key="getTrackKey"
          :item-height="56"
          :load-more-offset="120"
          :padding-top="16"
          :padding-bottom="16"
          sticky-offset="72px"
          :loading="isLoading || isFetchingNextPage"
          class="h-full"
          @load-more="handleLoadMore"
        >
          <template #before>
            <MediaHero
              :data="likedData"
              :has-tracks="tracks.length > 0"
              @play="handlePlayAll"
              @shuffle="handleShuffle"
              @add-to-queue="handleAddToQueue"
            >
              <template #actions>
                <Button
                  class="text-white"
                  variant="ghost"
                  @click="openAddTracksPanel"
                >
                  <IconPlus class="size-5" />
                  {{ $t("track.favorite.addTracks") }}
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
            <div
              class="px-4"
            >
              <TrackExpanded
                :track="item"
                :index="index + 1"
                :is-active="currentTrackId === item.id"
                menu-target="liked"
                @play="handlePlayTrack(index)"
                @contextmenu="handleContextMenu(item, index)"
              />
            </div>
          </template>

          <template #loader>
            <IconLoader2 class="size-5 animate-spin text-muted-foreground" />
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
                {{ $t("track.favorite.addTracks") }}
              </Button>
            </div>
          </template>
        </VirtualScrollable>
      </TrackContextMenu>

      <TrackDropdown context="liked" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import PageErrorState from "@/components/common/PageErrorState.vue";
import MediaHero from "@/modules/media-hero/components/MediaHero.vue";
import { Button } from "@/components/ui/button";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import IconLoader2 from "~icons/tabler/loader-2";
import IconPlus from "~icons/tabler/plus";
import { useLikedTracksPage } from "@/modules/favorite/composables/useLikedTracksPage";
import { getLikedTracksPageData } from "@/queries/track.queries";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import type { TrackSortKey } from "@/modules/tracks/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import type { Track } from "@/modules/player/types";
import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useQueueShuffle } from "@/modules/queue/composables/useQueueShuffle";

const queueStore = useQueueStore();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const { openMenu } = useTrackMenu();
const shuffleQueue = useQueueShuffle();
const route = useRoute();
const sortKey = ref<TrackSortKey | null>(null);

const {
  tracks,
  likedData,
  isLoading,
  isError,
  refetch,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useLikedTracksPage(sortKey);

const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function openAddTracksPanel() {
  rightPanelStore.openAddTracks({
    entityType: "favorite",
    entityId: "favorites",
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
  openMenu(track, index, { target: "liked" });
}

function handlePlayAll() {
  getLikedTracksPageData(sortKey.value).then((data) => {
    if (data && data.tracks.length > 0) {
      queueStore.setQueue(data.tracks, 0, {
        type: "liked",
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

  const data = await getLikedTracksPageData(sortKey.value);
  const fullIndex = data.tracks.findIndex(track => track.id === selectedTrack.id);
  if (fullIndex === -1) return;

  await queueStore.setQueue(data.tracks, fullIndex, {
    type: "liked",
  });
}

async function handleShuffle() {
  const source = { type: "liked" } as const;
  await shuffleQueue(source, async () => (await getLikedTracksPageData(sortKey.value)).tracks);
}

function handleAddToQueue() {
  if (tracks.value.length === 0) return;
  queueStore.addMultipleToQueue(tracks.value, {
    type: "liked",
  });
}
</script>
