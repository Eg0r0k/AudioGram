<template>
  <div
    ref="rootRef"
    class="flex h-full min-h-0 flex-col pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
  >
    <div class="flex items-center justify-between px-4 pt-2 h-14 shrink-0">
      <Button
        variant="ghost"
        size="icon"
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

    <div class="flex min-h-0 flex-1 flex-col w-full mx-auto px-6 pt-4 pb-6 max-w-md landscape-short:max-w-4xl landscape-short:flex-row landscape-short:items-stretch landscape-short:gap-6 landscape-short:px-4 landscape-short:pt-2 landscape-short:pb-4">
      <div class="flex-1 min-h-0 @container-[size] flex items-center justify-center pb-2 landscape-short:flex-none landscape-short:basis-[45%] landscape-short:pb-0">
        <div
          ref="coverRef"
          class="relative aspect-square w-[min(100cqw,100cqh)] rounded-2xl bg-muted overflow-hidden shadow-lg touch-pan-y"
        >
          <NuxtImage
            v-slot="{ imgAttrs, isLoaded, src }"
            :src="displayedCoverUrl"
            fallback-src="/img/fallback.svg"
            :alt="currentTrack?.title ?? ''"
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
          <CoverStateOverlay :visible="isScrubbing">
            <span class="text-2xl font-semibold tabular-nums text-white">
              {{ scrubTimeDisplay }}
            </span>
          </CoverStateOverlay>
        </div>
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
            :duration="playerStore.duration"
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
            :class="playerStore.repeatMode !== 'off' ? 'text-primary' : 'text-white'"
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
import { computed, ref, useTemplateRef, watch } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useTrackCover } from "@/modules/covers/composables/useTrackCover";
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
// The header names where the queue was started from (album, artist,
// playlist, ...) and opens it; plain "Now playing" when there is no page.
const { link: sourceLink } = useQueueSourceLink();
const { displayProgress, isTransitionEnabled, isScrubbing, scrubValue, onScrubStart, onScrub, onScrubEnd } = usePlayerProgress();

const scrubTimeDisplay = computed(() => {
  const target = (scrubValue.value / 100) * playerStore.duration;
  return `${formatDuration(target)} / ${formatDuration(playerStore.duration)}`;
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

  const time = (percent / 100) * playerStore.duration;
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

// Horizontal swipes on the cover mirror the next/previous buttons (same
// hasNext/hasPrevious gating); vertical swipes fall through to the root's
// swipe-down-to-close above.
const coverRef = useTemplateRef<HTMLDivElement>("coverRef");
useSwipeControl(coverRef, {
  threshold: 60,
  onSwipeLeft: () => {
    if (queueStore.hasNext) queueStore.next().catch(() => {});
  },
  onSwipeRight: () => {
    if (queueStore.hasPrevious) queueStore.previous().catch(() => {});
  },
});

const { presets, isActive: isSleepTimerActive, statusText, setTimer, cancel: cancelSleepTimer } = useSleepTimer();

// Any playing track — library or ephemeral (YouTube) — drives the display;
// library-only affordances (like, chapters, lyrics) gate on libraryTrack.
// Same split as SidebarMusic in the desktop footer.
const currentTrack = computed<PlayerTrack | null>(() => playerStore.currentTrack);
const libraryTrack = computed<Track | null>(() =>
  isLibraryTrack(currentTrack.value) ? currentTrack.value : null,
);

const { url: coverBlobUrl, isLoading: isCoverLoading } = useTrackCover(libraryTrack);

const coverUrl = computed(() => {
  const track = currentTrack.value;
  if (!track) return undefined;
  if (track.kind === "ephemeral") return track.cover;
  return coverBlobUrl.value ?? undefined;
});

// Sticky cover: on fast track switches coverUrl transiently goes undefined
// (the next album's blob is still loading) and the image component would
// flash its fallback art between tracks. Hold the previous cover on screen
// until the next one has actually decoded; show the fallback only once the
// absence is definitive (cover query settled empty) or the load errored.
const displayedCoverUrl = ref<string | undefined>(coverUrl.value);
let coverProbeToken = 0;
const COVER_PROBE_TIMEOUT_MS = 4000;

watch([coverUrl, isCoverLoading], ([nextUrl, loading]) => {
  const token = ++coverProbeToken;

  if (!nextUrl) {
    if (!loading) displayedCoverUrl.value = undefined;
    return;
  }

  const probe = new Image();
  probe.src = nextUrl;

  let hangGuard: ReturnType<typeof setTimeout> | undefined;
  const settle = (value: string | undefined) => {
    clearTimeout(hangGuard);
    if (token === coverProbeToken) displayedCoverUrl.value = value;
  };
  const commit = () => settle(nextUrl);
  const abandon = () => settle(undefined);

  // A hung remote load (neither load nor error) must not pin the previous
  // album's art forever: after the guard fires the new URL is applied anyway
  // and the image component's own load/error path takes over.
  hangGuard = setTimeout(commit, COVER_PROBE_TIMEOUT_MS);

  // Cached/decoded images (stableObjectUrl keeps blob covers alive) report
  // complete synchronously — swap without ever leaving the previous frame.
  if (probe.complete && probe.naturalWidth > 0) {
    commit();
    return;
  }

  if (typeof probe.decode === "function") {
    probe.decode().then(commit).catch(abandon);
  }
  else {
    probe.onload = commit;
    probe.onerror = abandon;
  }
}, { immediate: true });

const timeDisplay = computed(() => {
  if (playerStore.isLiveStream) return { current: "🔴", duration: "LIVE" };
  return {
    current: formatDuration(playerStore.currentTime),
    duration: formatDuration(playerStore.duration),
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
