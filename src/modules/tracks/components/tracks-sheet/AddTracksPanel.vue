<template>
  <EntitySelectPanel
    ref="panelRef"
    v-model:search="searchInput"
    :title="title"
    :items="tracks"
    :get-key="(track: Track) => track.id"
    :is-loading="isInitialLoading"
    :confirm-count="selectedCount"
    :show-back="rightPanel.depth > 0"
    @confirm="handleConfirm"
    @load-more="handleLoadMore"
    @back="handleBack"
    @close="closePanel"
  >
    <template #row="{ item, index }">
      <TrackSelectRow
        :track="item"
        :index="index"
        :is-selected="isTrackSelected(item.id)"
        @toggle-select="toggleTrackSelect"
      />
    </template>

    <template #empty>
      <Empty class="p-4 py-8 md:p-4 md:py-8">
        <EmptyDescription>{{ emptyLabel }}</EmptyDescription>
      </Empty>
    </template>

    <template #loader>
      <TrackRowLoading />
    </template>
  </EntitySelectPanel>
</template>

<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { EntitySelectPanel } from "@/components/entity-select";
import TrackSelectRow from "../TrackSelectRow.vue";
import TrackRowLoading from "../TrackRowLoading.vue";
import { addTracksToPlaylistAndSync } from "@/queries/playlist.queries";
import { queryKeys } from "@/queries/query-keys";
import {
  addTracksToAlbumAndSync,
  addTracksToArtistAndSync,
  favoriteTracksAndSync,
  getTracksPaginated,
} from "@/queries/track.queries";
import { AlbumId, ArtistId, PlaylistId } from "@/types/ids";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelAddTracksPayload } from "@/modules/right-panel/types";
import type { Track } from "@/modules/player/types";
import { useSelection } from "@/composables/useSelection";

const props = defineProps<{
  payload: RightPanelAddTracksPayload;
}>();

const { t } = useI18n();
const queryClient = useQueryClient();
const rightPanel = useRightPanelStore();

const searchInput = ref("");
const debouncedSearchQuery = refDebounced(searchInput, 200);

const normalizedEntityId = computed(() => String(props.payload.entityId));
const normalizedSearchQuery = computed(() => debouncedSearchQuery.value.trim());
const hasEntityId = computed(() => props.payload.entityType === "favorite" || normalizedEntityId.value.length > 0);

const {
  data: infiniteData,
  fetchNextPage,
  hasNextPage,
  isLoading,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: computed(() => queryKeys.tracks.allPaginated(normalizedSearchQuery.value)),
  queryFn: ({ pageParam = 0 }) => getTracksPaginated(pageParam, normalizedSearchQuery.value),
  initialPageParam: 0,
  getNextPageParam: lastPage => lastPage.nextOffset,
  enabled: hasEntityId,
  placeholderData: keepPreviousData,
});

const tracks = computed(() =>
  infiniteData.value?.pages.flatMap(page => page.tracks) ?? [],
);

const {
  selectedIds,
  selectedCount,
  isSelected: isTrackSelected,
  handleSelect: toggleTrackSelect,
  clearSelection,
  attachDragListeners,
} = useSelection(tracks);

const panelRef = useTemplateRef<{ listEl: HTMLElement | null }>("panelRef");

watch(
  () => panelRef.value?.listEl ?? null,
  (el, _prev, onCleanup) => {
    if (!el) return;
    const cleanup = attachDragListeners(el, {
      rowSelector: "[data-track-id]",
      idDataKey: "trackId",
      indexDataKey: "trackIndex",
    });
    onCleanup(cleanup);
  },
  { flush: "post" },
);

const selectedTracks = computed(() => {
  const ids = selectedIds.value;
  return tracks.value.filter(track => ids.has(track.id));
});
const isInitialLoading = computed(() => isLoading.value && tracks.value.length === 0);
const emptyLabel = computed(() =>
  normalizedSearchQuery.value.length > 0
    ? t("search.noResults.title", { query: normalizedSearchQuery.value })
    : t("common.empty"),
);
const title = computed(() => {
  switch (props.payload.entityType) {
    case "playlist":
      return t("sheet.addToPlaylist");
    case "album":
      return t("sheet.addToAlbum");
    case "artist":
      return t("sheet.addToArtist");
    case "favorite":
      return t("sheet.addToFavorites");
    default:
      return t("sheet.addTracks");
  }
});

const { mutateAsync: confirmSelection } = useMutation({
  mutationFn: async () => {
    const tracksToAdd = selectedTracks.value;

    if (tracksToAdd.length === 0) {
      return;
    }

    switch (props.payload.entityType) {
      case "playlist":
        await addTracksToPlaylistAndSync(
          queryClient,
          PlaylistId(normalizedEntityId.value),
          tracksToAdd,
        );
        break;

      case "album":
        await addTracksToAlbumAndSync(
          queryClient,
          AlbumId(normalizedEntityId.value),
          tracksToAdd,
        );
        break;

      case "artist":
        await addTracksToArtistAndSync(
          queryClient,
          ArtistId(normalizedEntityId.value),
          tracksToAdd,
        );
        break;

      case "favorite":
        await favoriteTracksAndSync(queryClient, tracksToAdd);
        break;
    }
  },
});

function handleLoadMore() {
  if (!hasNextPage.value || isFetchingNextPage.value) {
    return;
  }

  fetchNextPage();
}

async function handleConfirm() {
  if (selectedCount.value === 0) {
    return;
  }

  try {
    await confirmSelection();
    toast.success(t("sheet.addSuccess"));
    await props.payload.onConfirmed?.();
    closePanel();
  }
  catch {
    toast.error(t("sheet.addFailed"));
  }
}

function resetState() {
  clearSelection();
  searchInput.value = "";
}

function closePanel() {
  resetState();
  rightPanel.close();
}

function handleBack(): void {
  rightPanel.back();
}

watch(() => rightPanel.isOpen, (isOpen) => {
  if (!isOpen || rightPanel.view !== "add-tracks") {
    resetState();
  }
});
</script>
