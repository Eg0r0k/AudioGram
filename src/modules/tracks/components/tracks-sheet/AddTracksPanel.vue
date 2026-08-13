<template>
  <div class="relative flex h-full w-full flex-col overflow-hidden bg-card">
    <RightPanelHeader
      :title="title"
      :description="null"
      :show-back="rightPanel.depth > 0"
      @back="handleBack"
      @close="closePanel"
    />

    <div class=" bg-card px-4">
      <div class="flex items-center gap-3">
        <InputGroup class="flex-1 bg-background! rounded-full">
          <InputGroupInput
            v-model="searchInput"
            class="pl-3! text-[15px] "
            :placeholder="t('search.placeholder')"
            @keydown.stop
          />

          <InputGroupAddon
            v-if="searchInput.trim()"
            tabindex="-1"
            align="inline-end"
          >
            <Button
              class="rounded-full"
              variant="ghost-primary"
              size="icon-sm"
              @click="searchInput = ''"
            >
              <IconX class="size-5" />
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>

    <div
      ref="tracksListRef"
      class="min-h-0 flex-1 overflow-hidden relative"
    >
      <VirtualScrollable
        :items="tracks"
        :get-item-key="getTrackKey"
        :item-height="64"
        :load-more-offset="160"
        :padding-bottom="8"
        :padding-top="8"
        :loading="isInitialLoading"
        class="h-full"
        @load-more="handleLoadMore"
      >
        <template #default="{ item, index }">
          <div class="px-2">
            <TrackSelectRow
              :track="item"
              :index="index"
              :is-selected="isTrackSelected(item.id)"
              @toggle-select="toggleTrackSelect"
            />
          </div>
        </template>

        <template #loader>
          <TrackRowLoading />
        </template>

        <template #empty>
          <div class="px-4 py-8 text-center text-sm text-muted-foreground">
            {{ emptyLabel }}
          </div>
        </template>
      </VirtualScrollable>
      <AddFloatingButton
        :count="selectedCount"
        :show="selectedCount > 0"
        @click="handleConfirm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";
import TrackSelectRow from "../TrackSelectRow.vue";
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
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import IconX from "~icons/tabler/x";
import AddFloatingButton from "./AddFloatingButton.vue";
import TrackRowLoading from "../TrackRowLoading.vue";
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

const tracksListRef = useTemplateRef<HTMLElement>("tracksListRef");

watch(
  tracksListRef,
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

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

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
