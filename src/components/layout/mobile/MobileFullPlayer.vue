<template>
  <div
    ref="rootRef"
    class="flex flex-col w-full mx-auto min-h-0 px-6 pt-4 pb-6 max-w-md"
  >
    <div class="flex-1 min-h-0 @container-[size] flex items-center justify-center pb-2">
      <div class="aspect-square w-[min(100cqw,100cqh)] rounded-2xl bg-muted overflow-hidden shadow-lg">
        <NuxtImage
          v-slot="{ imgAttrs, isLoaded, src }"
          :src="coverUrl"
          fallback-src="/img/fallback.svg"
          :alt="currentTrack?.title ?? ''"
          :placeholder="true"
          custom
        >
          <img
            :key="src"
            v-bind="imgAttrs"
            :src="src"
            :alt="currentTrack?.title ?? ''"
            class="size-full object-cover transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-150"
            :class="isLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0 motion-reduce:scale-100'"
          >
        </NuxtImage>
      </div>
    </div>

    <div class="flex items-center justify-between gap-3 mt-6">
      <div class="min-w-0 flex-1">
        <MarqueeBlock
          :duration="10"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="transparent"
          gradient-length="20px"
        >
          <span class="text-xl text-white font-semibold leading-tight">{{ currentTrack?.title }}</span>
        </MarqueeBlock>
        <MarqueeBlock
          :duration="6"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="transparent"
          gradient-length="20px"
        >
          <span class="text-base text-white/80 capitalize mt-0.5 block">
            {{ currentTrack?.artist }}
          </span>
        </MarqueeBlock>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-lg"
          class="rounded-full text-white"
          @click.stop="toggleLike"
        >
          <IconLikedFilled
            v-if="currentTrack?.isLiked"
            class="size-6 text-primary"
          />
          <IconLike
            v-else
            class="size-6"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          class="rounded-full text-white"
          @click.stop="onDotsClick"
        >
          <IconDots class="size-6" />
        </Button>
      </div>
    </div>

    <div class="mt-6 flex flex-col gap-2">
      <RangeSelector
        :model-value="displayProgress"
        :step="1000 / 60 / 1000"
        :keyboard-step="5"
        :min="0"
        :max="100"
        :duration="playerStore.duration"
        :chapters="mobileChapters"
        :use-transform="true"
        :with-transition="false"
        :disable-transition="!isTransitionEnabled"
        :disabled="!playerStore.canSeek"
        :show-thumb="true"
        allow-marking
        style="--range-height: 4px; --range-height-hover: 4px; --range-radius: 9999px;"
        @add-mark="handleAddMark"
        @mousedown="onScrubStart"
        @scrub="onScrub"
        @mouseup="onScrubEnd"
      />
      <div class="flex justify-between text-xs text-white/50 font-medium tabular-nums">
        <span>{{ timeDisplay.current }}</span>
        <span>{{ timeDisplay.duration }}</span>
      </div>
    </div>

    <div class="flex items-center justify-between mt-6 px-2">
      <Button
        size="icon-lg"
        variant="ghost"
        class="rounded-full  text-white"
        :disabled="!queueStore.hasPrevious"
        :aria-label="$t('player.previousTrack')"
        @click.stop="queueStore.previous()"
      >
        <IconBack class="size-7" />
      </Button>
      <PlayButton
        class="size-18!"
        @click.stop
      />
      <Button
        size="icon-lg"
        variant="ghost"
        class="rounded-full text-white"
        :disabled="!queueStore.hasNext"
        :aria-label="$t('player.nextTrack')"
        @click.stop="queueStore.next()"
      >
        <IconForvard class="size-7" />
      </Button>
    </div>

    <div class="flex items-center justify-between mt-6 px-1">
      <Button
        size="icon"
        variant="ghost"
        :class="repeatModeClass"
        :aria-label="$t('player.repeat')"
        @click.stop="playerStore.toggleRepeat"
      >
        <IconRepeatOnce
          v-if="playerStore.repeatMode === 'one'"
          class="size-6"
        />
        <IconRepeat
          v-else
          class="size-6"
        />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        :class="{ 'text-primary': queueStore.isShuffled }"
        :aria-label="$t('player.shuffle')"
        @click.stop="queueStore.toggleShuffle()"
      >
        <IconShuffle class="size-6" />
      </Button>
      <Button
        v-if="currentTrack"
        size="icon"
        variant="ghost"
        :class="{ 'text-primary': isChaptersOpen }"
        :aria-label="$t('player.chapters')"
        @click.stop="toggleChaptersPanel"
      >
        <IconBookmarks class="size-6" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            size="icon"
            variant="ghost"
            @click.stop
          >
            <IconMoonStars
              class="size-6"
              :class="isSleepTimerActive ? 'text-primary': ''"
            />
          </Button>
          <DropdownMenuContent

            align="end"
            class="w-52"
          >
            <DropdownMenuLabel class="text-xs text-muted-foreground font-medium">
              {{ statusText }}
            </DropdownMenuLabel>
            <DropdownMenuItem
              v-for="preset in presets"
              :key="preset.minutes"
              @click="setTimer(preset.minutes)"
            >
              <IconClockHour4 class="size-5" />
              {{ $t("common.minutesShort", { count: preset.minutes }) }}
            </DropdownMenuItem>
            <template v-if="isSleepTimerActive">
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="cancelSleepTimer()"
              >
                <IconPlayerStop class="size-5" />
                {{ $t("player.cancelSleepTimer") }}
              </DropdownMenuItem>
            </template>
          </DropdownMenuContent>
        </DropdownMenuTrigger>
      </DropdownMenu>
    </div>

    <TrackDropdown
      context="current-track"
      :on-navigate="closePlayer"
    />
  </div>
</template>
<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useTrackMenu } from "@/modules/tracks/composables/useTrackMenu";
import TrackDropdown from "@/modules/tracks/components/menu/dropdown/TrackDropdown.vue";
import { formatDuration } from "@/lib/format/time";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import IconBack from "~icons/tabler/player-skip-back-filled";
import IconForvard from "~icons/tabler/player-skip-forward-filled";
import IconRepeat from "~icons/tabler/repeat";
import IconShuffle from "~icons/tabler/arrows-shuffle";
import IconRepeatOnce from "~icons/tabler/repeat-once";
import IconDots from "~icons/tabler/dots";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import IconMoonStars from "~icons/tabler/moon-stars";
import IconBookmarks from "~icons/tabler/bookmarks";
import IconClockHour4 from "~icons/tabler/clock-hour-4";
import IconPlayerStop from "~icons/tabler/circle-minus";

import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import { Button } from "@/components/ui/button";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import PlayButton from "@/modules/player/components/PlayButton.vue";
import type { Track } from "@/modules/player/types";
import { RangeSelector } from "@/modules/player";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { useTrackChapters, useSaveTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import { isLibraryTrack } from "@/modules/player/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { useSleepTimer } from "@/modules/player/composables/useSleepTimer";
import type { TrackId } from "@/types/ids";

withDefaults(defineProps<{
  backgroundColor?: string | null;
}>(), {
  backgroundColor: null,
});

const emit = defineEmits<{
  close: [];
}>();

const rootRef = useTemplateRef<HTMLDivElement>("rootRef");
const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const rightPanelStore = useRightPanelStore();
const saveChapters = useSaveTrackChapters();
const { toggleTrackLike } = useToggleTrackLike();
const { openDropdown } = useTrackMenu();
const { displayProgress, isTransitionEnabled, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();

const mobileTrackId = computed<TrackId>(() => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return "" as TrackId;
  return track.id;
});

const { data: mobileChapters } = useTrackChapters(mobileTrackId);

async function handleAddMark(percent: number) {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return;

  const time = (percent / 100) * playerStore.duration;
  const existing = mobileChapters.value ?? [];
  const updated = [...existing, { time, title: "" }].sort((a, b) => a.time - b.time);
  await saveChapters.mutateAsync({ trackId: track.id, chapters: updated });

  rightPanelStore.openChapters({ track });
}

const isChaptersOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "chapters",
);

const toggleChaptersPanel = () => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return;

  if (isChaptersOpen.value) {
    rightPanelStore.close();
    return;
  }
  rightPanelStore.openChapters({ track });
};

useSwipeControl(rootRef, {
  threshold: 50,
  onSwipeDown: () => emit("close"),
});

const { presets, isActive: isSleepTimerActive, statusText, setTimer, cancel: cancelSleepTimer } = useSleepTimer();

const currentTrack = computed<Track | null>(() => {
  const track = playerStore.currentTrack;
  return track?.kind === "library" ? track : null;
});

const { url: coverBlobUrl } = useEntityCover(
  "album",
  () => currentTrack.value?.albumId ?? null,
);

const coverUrl = computed(() => {
  const track = playerStore.currentTrack;
  if (!track) return undefined;
  if (track.kind === "ephemeral") return track.cover;
  return coverBlobUrl.value ?? undefined;
});

const repeatModeClass = computed(() => ({
  "text-primary": playerStore.repeatMode !== "off",
}));

const timeDisplay = computed(() => {
  if (playerStore.isLiveStream) return { current: "🔴", duration: "LIVE" };
  return {
    current: formatDuration(playerStore.currentTime),
    duration: formatDuration(playerStore.duration),
  };
});

const toggleLike = async () => {
  if (!currentTrack.value) return;
  await toggleTrackLike(currentTrack.value);
};

const onDotsClick = (event: MouseEvent) => {
  if (!currentTrack.value) return;
  openDropdown(currentTrack.value, 0, event, { target: "current-track" });
};

function closePlayer(): void {
  emit("close");
}
</script>
