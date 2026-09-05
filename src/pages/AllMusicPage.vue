<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class=" sm:px-6 px-4  pb-2">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex  w-full flex-col pt-4 gap-3 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            size="icon-lg"
            class="rounded-full shrink-0 "
            @click="goBack()"
          >
            <IconArrowLeft class="size-6" />
          </Button>

          <div class="flex min-w-0 flex-1 items-center gap-2">
            <InputGroup class="bg-muted! min-w-0 max-h-9 flex-1 rounded-full">
              <InputGroupAddon tabindex="-1">
                <IconSearch class="ml-1 size-5 text-muted-foreground" />
              </InputGroupAddon>

              <InputGroupInput
                v-model="searchQuery"
                class="pl-3! text-base!"
                :placeholder="t('search.mainPlaceholder')"
                @keydown.stop
                @keydown.esc="onSearchEscape"
              />

              <InputGroupAddon
                v-if="searchQuery.trim()"
                tabindex="-1"
                align="inline-end"
              >
                <Button
                  class="rounded-full"
                  variant="ghost-primary"
                  size="icon-sm"
                  @click="searchQuery = ''"
                >
                  <IconX class="size-5" />
                </Button>
              </InputGroupAddon>
            </InputGroup>

            <TrackSortMenu
              v-model:sort-key="sortKey"
            />
          </div>
        </div>
      </div>
    </div>

    <TrackContextMenu context="default">
      <CrossfadeTransition class="flex-1">
        <div
          v-if="isLoading"
          class="flex flex-col px-4 pt-4 sm:px-6"
        >
          <TrackRowLoading :rows="5" />
        </div>

        <div
          v-else-if="isError"
          class="flex flex-col items-center justify-center gap-4 px-4 text-center"
        >
          <div>
            <h2 class="text-2xl font-bold">
              {{ t('errors.tracksLoadFailed') }}
            </h2>
            <p class="text-muted-foreground">
              {{ errorMessage }}
            </p>
          </div>

          <Button @click="refetch">
            {{ t('common.retry') }}
          </Button>
        </div>

        <div
          v-else
          ref="tracksListRef"
          class="track-list-grid relative flex min-h-0 flex-col"
        >
          <div class="relative shrink-0 overflow-hidden">
            <Motion
              :animate="isSelectMode ? SORT_HIDDEN : SHOWN"
              :transition="headerTransition"
              :inert="isSelectMode || undefined"
            >
              <LibrarySortHeader
                v-model:sort-key="sortKey"
              />
            </Motion>

            <AnimatePresence>
              <Motion
                v-if="isSelectMode"
                key="selection-bar"
                :initial="BAR_HIDDEN"
                :animate="SHOWN"
                :exit="BAR_HIDDEN"
                :transition="headerTransition"
                class="absolute inset-0 bg-background"
              >
                <TrackSelectionBar
                  :count="selectedCount"
                  :all-selected="isAllSelected"
                  :all-liked="allLiked"
                  :busy="busy"
                  :selecting-all="isSelectingAll"
                  @exit="exitSelection"
                  @select-all="selectAll"
                  @deselect-all="deselectAll"
                  @play="play"
                  @play-next="playNext"
                  @add-to-queue="addToQueue"
                  @toggle-like="toggleLike"
                  @add-to-playlist="addToPlaylist"
                  @delete="deleteSelected"
                />
              </Motion>
            </AnimatePresence>
          </div>

          <VirtualScrollable
            :items="tracks"
            :get-item-key="getTrackKey"
            :item-height="56"
            :load-more-offset="120"
            :padding-top="8"
            :padding-bottom="8"
            :loading="isFetchingNextPage"
            class="flex-1"
            @load-more="handleLoadMore"
          >
            <template #default="{ item, index }">
              <div class="px-2">
                <TrackExpanded
                  :track="item"
                  :index="index + 1"
                  :is-active="currentTrackId === item.id"
                  :is-selected="isSelected(item.id)"
                  :is-selecting="isSelectMode"
                  :join-top="joinsSelectedNeighbour(index, -1)"
                  :join-bottom="joinsSelectedNeighbour(index, 1)"
                  selectable
                  @play="handlePlayTrack(index)"
                  @select="handleTrackSelect"
                  @contextmenu="handleContextMenu(item, index)"
                />
              </div>
            </template>

            <template #loader>
              <div class="flex items-center px-2 flex-col w-full">
                <TrackRowLoading />
              </div>
            </template>

            <template #empty>
              <Empty class="p-4 py-12 sm:px-6 md:py-12">
                <EmptyHeader>
                  <EmptyMedia
                    variant="icon"
                    class="rounded-full text-muted-foreground"
                  >
                    <component
                      :is="emptyIcon"
                      class="size-5"
                    />
                  </EmptyMedia>
                  <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </template>
          </VirtualScrollable>
        </div>
      </CrossfadeTransition>
    </TrackContextMenu>

    <TrackDropdown context="default" />
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import IconMusicOff from "~icons/tabler/music-off";
import IconSearchOff from "~icons/tabler/search-off";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import CrossfadeTransition from "@/components/transitions/CrossfadeTransition.vue";

import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconSearch from "~icons/tabler/search";
import IconX from "~icons/tabler/x";
import IconArrowLeft from "~icons/tabler/arrow-left";

import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackSortMenu from "@/modules/library/components/TrackSortMenu.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useI18n } from "vue-i18n";
import { computed, ref, useTemplateRef } from "vue";
import { AnimatePresence, Motion } from "motion-v";
import type { TrackSortKey } from "@/modules/tracks/types";
import { useIndexTracksPage } from "@/modules/tracks/composables/useIndexTracksPage";
import { getAllTrackIds, getAllTracksForQueue } from "@/queries/track.queries";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player";
import type { Track } from "@/modules/player/types";
import { useGoBack } from "@/composables/useGoBack";
import { getLogger } from "@/lib/logger";
import TrackSelectionBar from "@/modules/tracks/components/TrackSelectionBar.vue";
import { useTrackSelectionMode } from "@/modules/tracks/composables/useTrackSelectionMode";
import { useBulkTrackActions } from "@/modules/tracks/composables/useBulkTrackActions";
import { provideTrackSelectionEntry } from "@/modules/tracks/components/menu/useTrackSelectionEntry";
const { t } = useI18n();
const sortKey = ref<TrackSortKey | null>(null);
const searchQuery = ref("");
const {
  normalizedSearchQuery,
  resolvedSortKey,
  tracks,
  total,
  isLoading,
  isError,
  error,
  refetch,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useIndexTracksPage(sortKey, searchQuery);

const queueStore = useQueueStore();
const playerStore = usePlayerStore();
const { openMenu } = useTrackMenu();

const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

const tracksListRef = useTemplateRef<HTMLElement>("tracksListRef");

const {
  isSelectMode,
  isSelectingAll,
  isAllSelected,
  isSelected,
  selectedIds,
  selectedCount,
  handleTrackSelect,
  enter: enterSelection,
  exit: exitSelection,
  selectAll,
  deselectAll,
} = useTrackSelectionMode(tracks, tracksListRef, {
  getAllIds: () => getAllTrackIds(resolvedSortKey.value, normalizedSearchQuery.value),
  total,
  resetKey: computed(() => `${resolvedSortKey.value}|${normalizedSearchQuery.value}`),
});

provideTrackSelectionEntry(enterSelection);

const joinsSelectedNeighbour = (index: number, offset: -1 | 1) => {
  const list: readonly (Track | undefined)[] = tracks.value;
  const track = list[index];
  const neighbour = index + offset >= 0 ? list[index + offset] : undefined;
  return !!track && !!neighbour && isSelected(track.id) && isSelected(neighbour.id);
};

// The input stops keydown propagation so typing never hits global hotkeys,
// which also hides Escape from the mode's window listener.
const onSearchEscape = () => {
  if (isSelectMode.value) exitSelection();
};

const {
  busy,
  allLiked,
  play,
  playNext,
  addToQueue,
  toggleLike,
  addToPlaylist,
  deleteSelected,
} = useBulkTrackActions({
  selectedIds,
  loadedTracks: tracks,
  sortKey: resolvedSortKey,
  onDone: (action) => {
    if (action === "play" || action === "delete") exitSelection();
  },
});

const SHOWN = { opacity: 1, y: 0 };
const SORT_HIDDEN = { opacity: 0, y: -12 };
const BAR_HIDDEN = { opacity: 0, y: 12 };
const headerTransition = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

const emptyLabel = computed(() =>
  normalizedSearchQuery.value
    ? t("library.allMusic.noTracksFound", { query: normalizedSearchQuery.value })
    : t("library.allMusic.empty"),
);

const emptyIcon = computed(() =>
  normalizedSearchQuery.value ? IconSearchOff : IconMusicOff,
);

const errorMessage = computed(() =>
  error.value instanceof Error ? error.value.message : "Unknown error",
);

function handleLoadMore() {
  if (!hasNextPage.value || isFetchingNextPage.value) return;
  // The query keeps its own error state for the UI; the log is what tells us
  // WHY a scroll stopped loading more tracks.
  fetchNextPage().catch((err: unknown) => {
    getLogger().warn(`[AllMusicPage] Loading the next tracks page failed: ${String(err)}`);
  });
}

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "default" });
}

async function handlePlayTrack(index: number) {
  const track = tracks.value[index] as Track | undefined;
  if (!track) {
    return;
  }

  if (currentTrackId.value === track.id) {
    await playerStore.togglePlay();
    return;
  }

  const context = normalizedSearchQuery.value ? { type: "search" } as const : { type: "manual" } as const;
  const all = await getAllTracksForQueue(resolvedSortKey.value, normalizedSearchQuery.value);
  const fullIndex = all.findIndex(t => t.id === track.id);

  if (fullIndex === -1) {
    // Full-set fetch didn't contain the clicked track (e.g. a stale/partial search
    // result). Never waste the click — fall back to the loaded pages.
    console.warn(`[AllMusicPage] "${track.id}" missing from full queue set; using loaded pages.`);
    await queueStore.setQueue(tracks.value, index, context);
    return;
  }

  await queueStore.setQueue(all, fullIndex, context);
}

const goBack = useGoBack();

</script>
