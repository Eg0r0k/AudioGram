<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class=" px-4 pb-3">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex flex-col pt-4 gap-3 sm:flex-row sm:items-center">
          <Button
            variant="ghost"
            size="icon-lg"
            class="rounded-full shrink-0 text-white"
            @click="goBack()"
          >
            <IconArrowLeft class="size-5" />
          </Button>

          <InputGroup class="bg-muted!  min-w-0 flex-1 rounded-full">
            <InputGroupAddon tabindex="-1">
              <IconSearch class="ml-1 size-4.5 text-muted-foreground" />
            </InputGroupAddon>

            <InputGroupInput
              v-model="searchQuery"
              class="pl-3! text-[15px]"
              :placeholder="t('search.mainPlaceholder')"
              @keydown.stop
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

          <!-- <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button
                  variant="outline"
                  class="justify-between gap-2 rounded-full"
                >
                  <span>{{ currentSortLabel }}</span>
                  <IconChevronDown class="size-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                class="w-56"
              >
                <DropdownMenuItem @click="sortKey = 'date_added_desc'">
                  Date added: new first
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'date_added_asc'">
                  Date added: old first
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'title_asc'">
                  Title: A to Z
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'title_desc'">
                  Title: Z to A
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'artist_asc'">
                  Artist: A to Z
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'album_asc'">
                  Album: A to Z
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'album_desc'">
                  Album: Z to A
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'duration_asc'">
                  Duration: short first
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'duration_desc'">
                  Duration: long first
                </DropdownMenuItem>
                <DropdownMenuItem @click="sortKey = 'plays_desc'">
                  Most played
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> -->
        </div>
      </div>
    </div>

    <div
      v-if="isLoading"
      class="flex flex-1 flex-col px-4 pt-4 sm:px-6"
    >
      <TrackRowLoading :rows="5" />
    </div>

    <div
      v-else-if="isError"
      class="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
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

    <TrackContextMenu
      v-else
      context="default"
    >
      <div
        class="track-list-grid relative flex min-h-0 flex-1 flex-col"
      >
        <LibrarySortHeader
          v-model:sort-key="sortKey"
        />

        <VirtualScrollable
          :items="tracks"
          :get-item-key="getTrackKey"
          :item-height="56"
          :padding-top="8"
          :padding-bottom="8"
          class="flex-1"
        >
          <template #default="{ item, index }">
            <div class="px-4">
              <TrackExpanded
                :track="item"
                :index="index + 1"
                :is-active="currentTrackId === item.id"
                @play="handlePlayTrack(index)"
                @contextmenu="handleContextMenu(item, index)"
              />
            </div>
          </template>

          <template #empty>
            <div class="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
              {{ emptyLabel }}
            </div>
          </template>
        </VirtualScrollable>
      </div>
    </TrackContextMenu>

    <TrackDropdown context="default" />
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import VirtualScrollable from "@/components/ui/scrollable/VirtualScrollable.vue";

import TrackRowLoading from "@/modules/tracks/components/TrackRowLoading.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import IconSearch from "~icons/tabler/search";
import IconX from "~icons/tabler/x";
import IconArrowLeft from "~icons/tabler/arrow-left";

import LibrarySortHeader from "@/modules/library/components/LibrarySortHeader.vue";
import TrackExpanded from "@/modules/tracks/components/TrackExpanded.vue";
import { useI18n } from "vue-i18n";
import { computed, ref } from "vue";
import { TrackSortKey } from "@/modules/tracks/types";
import { useIndexTracksPage } from "@/modules/tracks/composables/useIndexTracksPage";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player";
import { Track } from "@/modules/player/types";
import { useRouter } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
const { t } = useI18n();
const router = useRouter();
const sortKey = ref<TrackSortKey | null>(null);
const searchQuery = ref("");
const {
  normalizedSearchQuery,
  tracks,
  isLoading,
  isError,
  error,
  refetch,
} = useIndexTracksPage(sortKey, searchQuery);

const queueStore = useQueueStore();
const playerStore = usePlayerStore();
const { openMenu } = useTrackMenu();

const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

const emptyLabel = computed(() =>
  normalizedSearchQuery.value
    ? t("library.allMusic.noTracksFound", { query: normalizedSearchQuery.value })
    : t("library.allMusic.empty"),
);

const errorMessage = computed(() =>
  error.value instanceof Error ? error.value.message : "Unknown error",
);

function getTrackKey(index: number) {
  return tracks.value[index]?.id ?? index;
}

function handleContextMenu(track: Track, index: number) {
  openMenu(track, index, { target: "default" });
}

async function handlePlayTrack(index: number) {
  const track = tracks.value[index];
  if (!track) {
    return;
  }

  if (currentTrackId.value === track.id) {
    playerStore.togglePlay();
    return;
  }

  await queueStore.setQueue(
    tracks.value,
    index,
    normalizedSearchQuery.value ? { type: "search" } : { type: "manual" },
  );
}

const fallbackRoute = routeLocation.home();

const goBack = () => {
  const prevPath = router.options.history.state?.back;

  if (prevPath && typeof prevPath === "string") {
    router.back();
  }
  else {
    router.push(fallbackRoute);
  }
};

</script>
