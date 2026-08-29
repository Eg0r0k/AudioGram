<template>
  <div
    ref="rootRef"
    class="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
  >
    <div class="flex items-center justify-between px-4 pt-2 h-14 shrink-0">
      <Button
        variant="ghost"
        size="icon-lg"
        class="text-white rounded-full"
        :aria-label="$t('common.close')"
        @click="closePlayer"
      >
        <IconChevronDown class="size-6" />
      </Button>

      <div class="flex min-w-0 flex-col items-center">
        <Link
          v-if="sourceLink"
          :to="sourceLink.to"
          class="max-w-55 truncate text-sm font-medium text-white hover:underline"
          @click="closePlayer"
        >
          {{ sourceLink.label }}
        </Link>
        <div
          v-else
          class="text-sm font-medium text-white"
        >
          {{ $t('player.nowPlaying') }}
        </div>

        <Button
          v-if="currentChapter"
          variant="ghost"
          class="mt-0.5 flex h-6 max-w-55 items-center gap-1 rounded-full px-2 text-white/80 hover:bg-white/10 hover:text-white"
          :aria-label="$t('player.chapters')"
          @click.stop="openChaptersPanel"
        >
          <IconBookmarks class="size-3.5 shrink-0" />
          <span class="truncate text-xs font-medium">
            {{ currentChapter.title || $t("chapters.untitled") }}
          </span>
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon-lg"
        class="rounded-full text-white"
        @click.stop="onDotsClick"
      >
        <IconDots class="size-6" />
      </Button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col w-full mx-auto px-6 pt-4 pb-6 max-w-md overflow-x-clip [mask-image:linear-gradient(to_right,transparent,#000_1.5rem,#000_calc(100%-1.5rem),transparent)] landscape-short:max-w-4xl landscape-short:flex-row landscape-short:items-stretch landscape-short:gap-6 landscape-short:px-4 landscape-short:pt-2 landscape-short:pb-4 landscape-short:[mask-image:linear-gradient(to_right,transparent,#000_1rem,#000_calc(100%-1rem),transparent)]">
      <div
        class="flex-1 min-h-0 @container-[size] select-none flex items-center justify-center pb-2 touch-pan-y landscape-short:flex-none landscape-short:basis-[45%] landscape-short:pb-0"
        @pointerdown="startDrag"
      >
        <motion.div
          drag="x"
          :drag-listener="false"
          :drag-controls="dragControls"
          :drag-constraints="SWIPE_DRAG_CONSTRAINTS"
          :drag-elastic="horizontalElastic"
          :drag-momentum="false"
          :drag-transition="SWIPE_DRAG_TRANSITION"
          :style="{ x }"
          class="flex size-full items-center justify-center"
          @drag-start="handleDragStart"
          @drag-end="(_event, info) => handleDragEnd(info)"
        >
          <div
            ref="coverRef"
            class="relative aspect-square w-[min(100cqw,100cqh)]"
          >
            <motion.div
              v-for="slot in slots"
              :key="slot.key"
              :aria-hidden="slot.role === 'center' ? undefined : 'true'"
              :class="COVER_SLOT_CLASS[slot.role]"
              :style="{ y: arcs[slot.role].y, rotate: arcs[slot.role].rotate, opacity: slotOpacity[slot.role] }"
            >
              <motion.div
                class="size-full"
                :initial="slot.role === 'center' ? false : { opacity: 0 }"
                :animate="{ opacity: 1 }"
                :transition="{ duration: 0.35 }"
              >
                <NuxtImage
                  :src="slot.coverUrl"
                  fallback-src="/img/fallback.svg"
                  :alt="slot.track.title"
                  loading="eager"
                  decoding="sync"
                  class="size-full object-cover"
                />
              </motion.div>
              <CoverStateOverlay :visible="slot.role === 'center' && isScrubbing">
                <span class="text-2xl font-semibold tabular-nums text-white">
                  {{ scrubTimeDisplay }}
                </span>
              </CoverStateOverlay>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div class="flex flex-col landscape-short:min-w-0 landscape-short:flex-1 landscape-short:justify-center">
        <div class="flex items-center justify-between gap-3 mt-6 h-14 landscape-short:mt-0">
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
                <template
                  v-for="(artistName, artistIndex) in artistsList"
                  :key="`${artistName}-${artistIndex}`"
                >
                  <span
                    v-if="canNavigateArtists"
                    role="link"
                    tabindex="0"
                    class="inline-block cursor-pointer py-1.5 -my-1.5 active:text-white"
                    @click.stop="goToArtistAt(artistIndex)"
                    @keypress.enter.stop="goToArtistAt(artistIndex)"
                  >{{ artistName }}</span>
                  <span v-else>{{ artistName }}</span>
                  <span v-if="artistIndex < artistsList.length - 1">, </span>
                </template>
              </span>
            </MarqueeBlock>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <Button
              v-if="libraryTrack"
              variant="ghost"
              size="icon-lg"
              class="rounded-full text-white"
              :aria-label="libraryTrack.isLiked ? $t('player.unlike') : $t('player.like')"
              @click.stop="toggleLike"
            >
              <IconLikedFilled
                v-if="libraryTrack.isLiked"
                class="size-6 text-primary"
              />
              <IconLike
                v-else
                class="size-6"
              />
            </Button>
          </div>
        </div>

        <div class="mt-6 flex flex-col gap-2 landscape-short:mt-3">
          <RangeSelector
            :model-value="displayProgress"
            :step="1000 / 60 / 1000"
            :keyboard-step="5"
            :min="0"
            :max="100"
            :duration="playerStore.duration ?? 0"
            :chapters="mobileChapters"
            :use-transform="true"
            :with-transition="false"
            :disable-transition="!isTransitionEnabled"
            :disabled="!playerStore.canSeek"
            :show-thumb="true"
            :show-tooltip="false"
            allow-marking
            style="--range-height-hover: 4px; --range-radius: 9999px;"
            @add-mark="handleAddMark"
            @mousedown="onScrubStart"
            @scrub="onScrub"
            @mouseup="onScrubEnd"
          />
          <div class="flex justify-between text-sm text-white/60 font-medium tabular-nums">
            <span>{{ timeDisplay.current }}</span>
            <span>{{ timeDisplay.duration }}</span>
          </div>
        </div>

        <div class="flex items-center justify-between mt-6 landscape-short:mt-3">
          <Button
            size="icon-lg"
            variant="ghost"
            class="rounded-full"
            :class="queueStore.isShuffled ? 'text-primary' : 'text-white'"
            :aria-label="$t('player.shuffle')"
            @click.stop="queueStore.toggleShuffle()"
          >
            <IconShuffle class="size-6" />
          </Button>
          <Button
            size="icon-lg"
            variant="ghost"
            class="rounded-full text-white"
            :disabled="!queueStore.hasPrevious"
            :aria-label="$t('player.previousTrack')"
            @click.stop="queueStore.previous()"
          >
            <IconBack class="size-6" />
          </Button>
          <PlayButton
            class="size-15!"
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
            <IconForvard class="size-6" />
          </Button>
          <Button
            size="icon-lg"
            variant="ghost"
            class="rounded-full"
            :class="queueStore.repeatMode !== 'off' ? 'text-primary' : 'text-white'"
            :aria-label="$t('player.repeat')"
            @click.stop="queueStore.toggleRepeat"
          >
            <IconRepeatOnce
              v-if="queueStore.repeatMode === 'one'"
              class="size-6"
            />
            <IconRepeat
              v-else
              class="size-6"
            />
          </Button>
        </div>

        <div class="flex items-center justify-between mt-6 px-1 landscape-short:mt-3">
          <Button
            v-if="libraryTrack"
            size="icon"
            variant="ghost"
            :class="{ 'text-primary': isChaptersOpen }"
            :aria-label="$t('player.chapters')"
            @click.stop="toggleChaptersPanel"
          >
            <IconBookmarks class="size-6" />
          </Button>
          <Button
            v-if="libraryTrack"
            size="icon"
            variant="ghost"
            :class="{ 'text-primary': isLyricsOpen }"
            :aria-label="$t('player.lyrics')"
            @click.stop="toggleLyricsPanel"
          >
            <IconMicrophone2 class="size-6" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            :class="{ 'text-primary': isQueueOpen }"
            :aria-label="$t('player.queue')"
            @click.stop="toggleQueuePanel"
          >
            <IconPlaylist class="size-6" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                size="icon"
                variant="ghost"
                :aria-label="statusText"
                @click.stop
              >
                <IconMoonStars
                  class="size-6"
                  :class="isSleepTimerActive ? 'text-primary' : ''"
                />
              </Button>
            </DropdownMenuTrigger>
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
          </DropdownMenu>
        </div>
      </div>

      <TrackDropdown
        context="current-track"
        :on-navigate="closePlayer"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, useTemplateRef } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useTrackContextActions } from "@/modules/tracks/composables/useTrackContextActions";
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
import IconMicrophone2 from "~icons/tabler/microphone-2";
import IconPlaylist from "~icons/tabler/playlist";
import IconClockHour4 from "~icons/tabler/clock-hour-4";
import IconPlayerStop from "~icons/tabler/circle-minus";
import IconChevronDown from "~icons/tabler/chevron-down";

import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import { Button } from "@/components/ui/button";
import { Link } from "@/components/ui/link";
import { useQueueSourceLink } from "@/modules/queue/composables/useQueueSourceLink";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import CoverStateOverlay from "@/components/layout/mobile/CoverStateOverlay.vue";
import PlayButton from "@/modules/player/components/PlayButton.vue";
import type { PlayerTrack, Track } from "@/modules/player/types";
import { RangeSelector } from "@/modules/player";
import { usePlayerProgress } from "@/modules/tracks/composables/usePlayerProgress";
import { useTrackChapters, useSaveTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import { isLibraryTrack } from "@/modules/player/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useSwipeControl } from "@/composables/useSwipeControl";
import { useSleepTimer } from "@/modules/player/composables/useSleepTimer";
import { useDisplayedPlaybackTime } from "@/modules/player/composables/useDisplayedPlaybackTime";
import {
  SWIPE_DRAG_CONSTRAINTS,
  SWIPE_DRAG_TRANSITION,
  useTrackSwipe,
  type SwipeSlotRole,
} from "@/modules/player/composables/useTrackSwipe";
import { useElementSize } from "@vueuse/core";
import { motion, useTransform } from "motion-v";
import type { TrackId } from "@/types/ids";

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
const { link: sourceLink } = useQueueSourceLink();
const { displayProgress, isTransitionEnabled, isScrubbing, scrubValue, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();

const scrubTimeDisplay = computed(() => {
  const duration = playerStore.duration ?? 0;
  const target = (scrubValue.value / 100) * duration;
  return `${formatDuration(target)} / ${formatDuration(duration)}`;
});

const mobileTrackId = computed<TrackId>(() => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return "" as TrackId;
  return track.id;
});

const { data: mobileChapters } = useTrackChapters(mobileTrackId);

async function handleAddMark(percent: number) {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return;

  const time = (percent / 100) * (playerStore.duration ?? 0);
  const existing = mobileChapters.value ?? [];
  const updated = [...existing, { time, title: "" }].sort((a, b) => a.time - b.time);
  await saveChapters.mutateAsync({ trackId: track.id, chapters: updated });

  rightPanelStore.openChapters({ track });
}

const openChaptersPanel = () => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return;
  rightPanelStore.openChapters({ track });
};

const isChaptersOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "chapters",
);

const toggleChaptersPanel = () => {
  if (isChaptersOpen.value) {
    rightPanelStore.close();
    return;
  }
  openChaptersPanel();
};

const isLyricsOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "lyrics",
);

const toggleLyricsPanel = () => {
  if (isLyricsOpen.value) {
    rightPanelStore.close();
    return;
  }
  rightPanelStore.openLyrics();
};

const isQueueOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "queue",
);

const toggleQueuePanel = () => {
  if (isQueueOpen.value) {
    rightPanelStore.close();
    return;
  }
  rightPanelStore.openQueue();
};

// The chapter whose start the playhead has passed; the sorted list makes the
// last matching entry the active one.
const currentChapter = computed(() => {
  const list = mobileChapters.value ?? [];
  if (list.length === 0) return null;

  let active = list[0];
  for (const chapter of list) {
    if (chapter.time > playerStore.currentTime) break;
    active = chapter;
  }
  return active;
});

useSwipeControl(rootRef, {
  threshold: 50,
  onSwipeDown: () => emit("close"),
});

const { presets, isActive: isSleepTimerActive, statusText, setTimer, cancel: cancelSleepTimer } = useSleepTimer();

// Any playing track — library or ephemeral (YouTube) — drives the display;
// library-only affordances (like, chapters, lyrics) gate on libraryTrack.
// Same split as SidebarMusic in the desktop footer.
const currentTrack = computed<PlayerTrack | null>(() => playerStore.currentTrack);
const libraryTrack = computed<Track | null>(() =>
  isLibraryTrack(currentTrack.value) ? currentTrack.value : null,
);

// Dragging anywhere in the cover block (not just the square) pulls the strip
// of previous/current/next covers sideways; vertical pulls keep their
// `pan-y` touch-action and fall through to the root's swipe-down-to-close.
const coverRef = useTemplateRef<HTMLDivElement>("coverRef");
const { width: coverWidth } = useElementSize(coverRef);
const COVER_GAP = 32;
const slotWidth = () => coverWidth.value + COVER_GAP;

const {
  x,
  slots,
  horizontalElastic,
  dragControls,
  startDrag,
  handleDragStart,
  handleDragEnd,
} = useTrackSwipe({ width: slotWidth, offsetThreshold: 70 });

// A slot keeps its DOM node across role changes (keyed by queue item), so a
// swap only changes these classes — the <img> that slid into view stays.
const COVER_SLOT_CLASS: Record<SwipeSlotRole, string> = {
  previous: "pointer-events-none absolute top-0 right-[calc(100%+32px)] size-full rounded-2xl bg-muted overflow-hidden shadow-lg",
  center: "relative z-10 size-full rounded-2xl bg-muted overflow-hidden shadow-lg",
  next: "pointer-events-none absolute top-0 left-[calc(100%+32px)] size-full rounded-2xl bg-muted overflow-hidden shadow-lg",
};

// Covers ride a wheel whose hub sits below the screen: a card one slot away
// from the centre is tilted by ARC_ANGLE and sits ARC_DIP lower, and the
// strip's x offset turns the whole wheel.
const ARC_ANGLE = 12;
const ARC_DIP = 32;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const dipScale = ARC_DIP / (1 - Math.cos(toRadians(ARC_ANGLE)));

const useArc = (slot: -1 | 0 | 1) => {
  const angleAt = (value: number) => (value / Math.max(1, slotWidth()) + slot) * ARC_ANGLE;
  return {
    y: useTransform(x, value => dipScale * (1 - Math.cos(toRadians(angleAt(value))))),
    rotate: useTransform(x, value => angleAt(value)),
  };
};

const arcs: Record<SwipeSlotRole, ReturnType<typeof useArc>> = {
  previous: useArc(-1),
  center: useArc(0),
  next: useArc(1),
};

const travel = (value: number) => Math.min(1, Math.abs(value) / Math.max(1, slotWidth()));
const slotOpacity = {
  center: useTransform(x, value => 1 - 0.4 * travel(value)),
  next: useTransform(x, value => (value < 0 ? 0.6 + 0.4 * travel(value) : 0.6)),
  previous: useTransform(x, value => (value > 0 ? 0.6 + 0.4 * travel(value) : 0.6)),
} satisfies Record<SwipeSlotRole, unknown>;

const { currentTime: displayedTime, duration: displayedDuration } = useDisplayedPlaybackTime();

const timeDisplay = computed(() => {
  if (playerStore.isLiveStream) return { current: "🔴", duration: "LIVE" };
  return {
    current: formatDuration(displayedTime.value),
    duration: displayedDuration.value === null ? "–:––" : formatDuration(displayedDuration.value),
  };
});

const toggleLike = async () => {
  if (!libraryTrack.value) return;
  await toggleTrackLike(libraryTrack.value);
};

// Tappable artist caption, mirroring SidebarMusic: split the display string
// per artist and index into artistIds. goToArtist comes from the shared
// context actions so it closes the player (onNavigate) and composes with the
// back-stack's navigation guard. Ephemeral (YT/ND) tracks have no artist
// entities — the caption stays plain text, same as the dots menu hides its
// navigation items for them.
const trackActions = useTrackContextActions(currentTrack, { onNavigate: closePlayer });

const artistsList = computed(() => {
  const artistNames = currentTrack.value?.artist;
  if (!artistNames) return [];
  return artistNames.split(/,\s*/).map(name => name.trim()).filter(Boolean);
});

const canNavigateArtists = computed(() => libraryTrack.value !== null);

const goToArtistAt = (index: number) => {
  const artistId = libraryTrack.value?.artistIds?.[index];
  if (!artistId) return;
  trackActions.goToArtist(artistId);
};

const onDotsClick = (event: MouseEvent) => {
  if (!currentTrack.value) return;
  openDropdown(currentTrack.value, 0, event, { target: "current-track" });
};

function closePlayer(): void {
  emit("close");
}
</script>
