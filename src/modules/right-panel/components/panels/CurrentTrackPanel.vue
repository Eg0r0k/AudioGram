<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader :title="$t('player.nowPlaying')">
      <template #trailing>
        <Button
          v-if="currentTrack"
          size="icon"
          class="rounded-full"
          variant="ghost"
          @click.stop="onDotsClick"
        >
          <IconDots class="size-6" />
        </Button>
      </template>
    </RightPanelHeader>
    <Scrollable class="flex-1">
      <div
        class="grid gap-4 py-4 px-5 pt-0"
      >
        <TrackContextMenu context="current-track">
          <div>
            <MorphingDialog
              :transition="{
                type: 'spring',
                bounce: 0.3,
                duration: 0.4,
              }"
            >
              <MorphingDialogTrigger
                :data-track-menu-trigger="currentTrack ? true : undefined"
                class="block w-full select-none  rounded-lg overflow-hidden "
                @contextmenu="onCoverContextMenu"
              >
                <NuxtImage
                  v-slot="{ imgAttrs, isLoaded, src }"
                  :src="coverUrl"
                  fallback-src="/img/fallback.svg"
                  custom
                >
                  <img
                    :key="src"
                    v-bind="imgAttrs"
                    :src="src"
                    alt=""
                    class="aspect-square w-full object-cover transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-150"
                    :class="isLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0 motion-reduce:scale-100'"
                  >
                </NuxtImage>
              </MorphingDialogTrigger>
              <MorphingDialogContainer>
                <MorphingDialogContent
                  class="
            relative
            select-none
            overflow-hidden
            rounded-3xl
            bg-transparent
            shadow-none
          "
                >
                  <NuxtImage
                    v-slot="{ imgAttrs, isLoaded, src }"
                    :src="coverUrl"
                    fallback-src="/img/fallback.svg"
                    class="
              h-auto
              w-full
              max-w-[90vw]
              object-cover
              lg:h-[70vh]
              lg:w-auto
            "
                    custom
                  >
                    <img
                      :key="src"
                      v-bind="imgAttrs"
                      :src="src"
                      alt=""
                      class="aspect-square w-full object-cover transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-150"
                      :class="isLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0 motion-reduce:scale-100'"
                    >
                  </NuxtImage>
                  <MorphingDialogClose />
                </MorphingDialogContent>
              </MorphingDialogContainer>
            </MorphingDialog>
          </div>
        </TrackContextMenu>

        <template v-if="currentTrack">
          <div class="grid gap-3">
            <div class="flex justify-between items-center relative select-none">
              <div class="grid gap-1 flex-1 min-w-0 max-w-fit overflow-hidden mx-2">
                <MarqueeBlock
                  class="group"
                  :duration="20"
                  animate-on-overflow-only
                  pause-on-hover
                  gradient
                  gradient-color="var(--card)"
                  gradient-length="20px"
                >
                  <span
                    v-copy="currentTrack?.title"
                    class="text-2xl group-hover:underline font-bold cursor-pointer"
                  >{{ currentTrack?.title }}</span>
                </MarqueeBlock>

                <MarqueeBlock
                  class="group"
                  :duration="6"
                  animate-on-overflow-only
                  pause-on-hover
                  gradient
                  gradient-color="var(--card)"
                  gradient-length="20px"
                >
                  <span class="text-muted-foreground group-hover:text-foreground text-xs transition-colors duration-200">
                    <template
                      v-for="(artist, i) in artistsList"
                      :key="artist"
                    >
                      <span
                        role="link"
                        tabindex="0"
                        class="cursor-pointer hover:underline"
                        @click.stop="goToArtist(i)"
                        @keypress.enter.stop="goToArtist(i)"
                      >
                        {{ artist }}
                      </span>

                      <span v-if="i < artistsList.length - 1">, </span>
                    </template>
                  </span>
                </MarqueeBlock>
              </div>
              <Button
                v-if="libraryTrack"
                variant="ghost"
                size="icon"
                class="shrink-0 rounded-full"
                @click="toggleLike"
              >
                <IconHeartFilled
                  v-if="libraryTrack.isLiked"
                  class="size-6 text-primary"
                />
                <IconHeart
                  v-else
                  class="size-6"
                />
              </Button>
              <Button
                v-else-if="importPath"
                variant="ghost"
                size="icon"
                class="shrink-0 rounded-full"
                :disabled="isImportRunning"
                :title="$t('common.import.toLibrary')"
                :aria-label="$t('common.import.toLibrary')"
                @click="importCurrent"
              >
                <IconFileImport class="size-6" />
              </Button>
            </div>

            <div
              class="flex flex-col min-w-0 gap-1 p-2 rounded-sm"
              :style="contentCoverStyle"
            >
              <div class="flex items-center justify-between gap-3 px-2">
                <div>
                  <p class="text-sm font-medium text-white">
                    {{ $t('player.upNextLabel') }}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  class="rounded-full px-2"
                  @click="rightPanel.openQueue()"
                >
                  {{ $t('queue.showQueue') }}
                </Button>
              </div>

              <TrackContextMenu context="queue">
                <TrackRow
                  v-if="nextQueueItem"
                  hide-index
                  class="text-white! hover:bg-muted/80!"
                  menu-target="queue"
                  :track="nextQueueItem.track as Track"
                  :menu-index="nextQueueIndex"
                  :queue-item-id="nextQueueItem.id"
                  @play="queueStore.jumpTo(nextQueueIndex)"
                />
              </TrackContextMenu>
              <TrackDropdown context="queue" />
              <TrackDropdown context="current-track" />
            </div>
          </div>
        </template>

        <Empty
          v-else
          class="p-6 py-12 md:p-6 md:py-12"
        >
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              class="rounded-full text-muted-foreground"
            >
              <IconMusicOff class="size-5" />
            </EmptyMedia>
            <EmptyDescription>{{ $t('player.nothingPlaying') }}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Scrollable } from "@/components/ui/scrollable";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import IconMusicOff from "~icons/tabler/music-off";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { isLibraryTrack, type Track } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useEphemeralImport } from "@/modules/tracks/composables/useEphemeralImport";
import IconHeart from "~icons/tabler/heart";
import IconHeartFilled from "~icons/tabler/heart-filled";
import IconDots from "~icons/tabler/dots";
import IconFileImport from "~icons/tabler/file-import";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import RightPanelHeader from "../RightPanelHeader.vue";
import TrackContextMenu from "@/modules/tracks/components/menu/context-menu/TrackContextMenu.vue";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import { routeLocation } from "@/app/router/route-locations";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import { useMobilePlayerColor } from "@/modules/player/composables/useMobilePlayerColor";

import {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogClose,
} from "@/components/ui/motion/dialog";

const { color: playerColor } = useMobilePlayerColor();

const contentCoverStyle = computed(() => ({
  background: `color-mix(in oklch, ${playerColor.value.hsl} 25%, black)`,
}));
const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const rightPanel = useRightPanelStore();
const router = useRouter();
const { toggleTrackLike } = useToggleTrackLike();

const { openDropdown, openMenu } = useTrackMenu();

function onDotsClick(event: MouseEvent): void {
  if (!currentTrack.value) return;
  openDropdown(currentTrack.value, 0, event, { target: "current-track" });
}

function onCoverContextMenu(): void {
  if (!currentTrack.value) return;
  openMenu(currentTrack.value, 0, { target: "current-track" });
}

const currentTrack = computed(() => playerStore.currentTrack);
const libraryTrack = computed<Track | null>(() => {
  const track = currentTrack.value;
  return track && isLibraryTrack(track) ? track : null;
});

const { url: coverBlobUrl } = useEntityCover("album", () => libraryTrack.value?.albumId ?? null);

const coverUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return "/img/fallback.svg";
  if (!isLibraryTrack(track)) return track.cover ?? "/img/fallback.svg";
  return coverBlobUrl.value ?? "/img/fallback.svg";
});

const artistsList = computed(() => {
  const artistValue = currentTrack.value?.artist;
  if (!artistValue) return [];
  return artistValue.split(/,\s*/).map(part => part.trim()).filter(Boolean);
});

const nextQueueIndex = computed(() => {
  if (!queueStore.hasNext) return -1;
  return queueStore.currentIndex + 1;
});

const nextQueueItem = computed(() => {
  if (nextQueueIndex.value < 0) return null;
  return queueStore.queue[nextQueueIndex.value] ?? null;
});

async function toggleLike(): Promise<void> {
  if (!libraryTrack.value) return;
  await toggleTrackLike(libraryTrack.value);
}

// "Open with" ephemeral track (M3): CTA into the import pipeline; success
// swaps the queue entry onto the library track without restarting playback.
const { importPath, isRunning: isImportRunning, importCurrent } = useEphemeralImport(currentTrack);

function goToArtist(index: number): void {
  const artistId = libraryTrack.value?.artistIds?.[index];
  if (!artistId) return;
  router.push(routeLocation.artist(artistId));
}
</script>
