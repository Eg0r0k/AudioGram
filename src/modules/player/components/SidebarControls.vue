<template>
  <div class="flex min-w-[180px] w-[30%] justify-end pr-1">
    <div class="flex w-full gap-0.5 justify-end items-center grow">
      <Button
        v-if="playerStore.currentTrack?.kind === 'library'"
        variant="ghost"
        class="mr-1 h-auto w-auto min-w-0 rounded-full py-1 pr-1.5! gap-0.5 text-sm font-medium text-muted-foreground select-none overflow-hidden"
        :aria-label="$t('player.chapters')"
        :title="$t('player.chapters')"
        @click="toggleChaptersPanel"
      >
        <AnimatePresence mode="wait">
          <motion.span
            :key="activeChapterSegment?.title ?? 'empty'"
            :initial="{ opacity: 0, y: -10, filter: 'blur(4px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: 10, filter: 'blur(4px)' }"
            :transition="{ duration: 0.15, ease: 'easeInOut' }"
            class="block truncate"
          >
            {{ activeChapterSegment?.title ?? $t("player.chapters") }}
          </motion.span>
        </AnimatePresence>
        <IconChevronRight class="size-5 shrink-0" />
      </Button>

      <Button
        variant="ghost"
        class="mr-2 h-auto rounded-full px-2 gap-0.5 py-1 text-sm font-medium text-muted-foreground select-none whitespace-nowrap"
        @click="toggleTimeDisplayMode"
      >
        <span>{{ timeDisplay.current }}</span>
        <span class="mx-0.5">/</span>
        <span :class="{ 'text-red-500 font-semibold': playerStore.isLiveStream }">
          {{ timeDisplay.duration }}
        </span>
      </Button>

      <VolumeButton />

      <Button
        size="icon-sm"
        variant="ghost"
        :class="{ 'text-primary': isQueueOpen }"
        :aria-label="$t('queue.title')"
        :title="$t('queue.title')"
        @click="toggleQueuePanel"
      >
        <IconPlaylist class="size-4.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            class=" relative"
            size="icon-sm"
            variant="ghost"
          >
            <IconCategory class="size-4.5" />

            <AnimatePresence>
              <motion.div
                v-if="playerStore.playbackRate !== 1"
                key="rate-badge"
                class="absolute top-0 -right-1 border-card border-2 bg-foreground text-card rounded-full h-3.5 flex items-center justify-center border-full"
                :initial="{ opacity: 0, scale: 0.5 }"
                :animate="{ opacity: 1, scale: 1 }"
                :exit="{ opacity: 0, scale: 0.5 }"
                :transition="{ duration: 0.10 }"
                layout
              >
                <span class="text-[8px] font-bold leading-none px-0.5 whitespace-nowrap">
                  {{ formatPlaybackRate(playerStore.playbackRate) }}
                </span>
              </motion.div>
            </AnimatePresence>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          class="w-52"
        >
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconMoonStars
                class="size-5"
              />
              <span>
                {{ $t("player.sleepTimer") }}
              </span>
              <span
                v-if="isSleepTimerActive"
                class="ml-auto text-xs text-muted-foreground"
              >
                {{ remainingText }}
              </span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              <DropdownMenuLabel class="text-xs text-muted-foreground font-normal">
                {{ statusText }}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                v-for="preset in presets"
                :key="preset.minutes"
                @click="setTimer(preset.minutes)"
              >
                <IconClockHour4 class="size-5 " />
                {{ t("common.minutesShort", { count: preset.minutes }) }}
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
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconGauge class="size-5" />
              <span>
                {{ $t("player.playbackSpeed") }}
              </span>
              <span class="ml-auto text-xs text-muted-foreground">
                {{ formattedPlaybackRate }}
              </span>
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                :model-value="String(playerStore.playbackRate)"
                @update:model-value="handlePlaybackRateChange"
              >
                <DropdownMenuRadioItem
                  v-for="rate in playbackRatePresets"
                  :key="rate"
                  :value="String(rate)"
                >
                  {{ formatPlaybackRate(rate) }}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem @click="router.push(routeLocation.settingsAudio())">
            <IconEqualizer class="size-5" />
            {{ $t("player.equalizer") }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="pip.PIP_SUPPORTED"
            :class="{ 'text-primary': pip.isPipOpen.value }"
            @click="handlePipToggle"
          >
            <IconPIP class="size-5" />
            {{ $t("player.pip") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import type { App } from "vue";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { formatDuration } from "@/lib/format/time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import IconCategory from "~icons/tabler/category";
import IconMoonStars from "~icons/tabler/moon-stars";
import IconClockHour4 from "~icons/tabler/clock-hour-4";
import IconPlayerStop from "~icons/tabler/circle-minus";
import IconEqualizer from "~icons/tabler/adjustments-horizontal";
import IconPIP from "~icons/tabler/picture-in-picture";
import IconGauge from "~icons/tabler/gauge";
import IconChevronRight from "~icons/tabler/chevron-right";

import VolumeButton from "./actions/VolumeButton.vue";
import { useRouter } from "vue-router";
import { routeLocation } from "@/app/router/route-locations";
import type { Pinia } from "pinia";
import { getActivePinia } from "pinia";
import { usePictureInPicture } from "@/composables/usePictureInPicture";
import { i18n } from "@/app/i18n";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import IconPlaylist from "~icons/tabler/playlist";

import PIPContent from "./pip/PIPContent.vue";
import { useQueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useSleepTimer } from "../composables/useSleepTimer";
import { useDisplayedPlaybackTime } from "../composables/useDisplayedPlaybackTime";
import { useTrackChapters } from "@/modules/tracks/composables/useTrackChapters";
import { isLibraryTrack } from "@/modules/player/types";
import type { TrackId } from "@/types/ids";
const router = useRouter();

const playbackRatePresets = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const { t } = useI18n();
const playerStore = usePlayerStore();
const rightPanelStore = useRightPanelStore();
const { presets, isActive: isSleepTimerActive, remainingText, statusText, setTimer, cancel: cancelSleepTimer } = useSleepTimer();

const timeDisplayMode = ref<"total" | "remaining">("total");

const isQueueOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "queue",
);

const formattedPlaybackRate = computed(() => formatPlaybackRate(playerStore.playbackRate));

const pinia = getActivePinia();
const pip = usePictureInPicture();
const queryClient = useQueryClient();

const getPipOptions = () => ({
  component: PIPContent,
  width: 400,
  height: 280,
  plugins: [
    pinia as Pinia,
    i18n,
    { install: (app: App) => app.use(VueQueryPlugin, { queryClient }) },
  ],
});

const handlePipToggle = async () => {
  await pip.toggle(getPipOptions());
};

const formatPlaybackRate = (rate: number) => `${rate.toFixed(2).replace(/\.00$/, "").replace(/0$/, "")}x`;

const handlePlaybackRateChange = (value: string) => {
  playerStore.setPlaybackRate(Number(value));
};

const toggleQueuePanel = () => {
  if (isQueueOpen.value) {
    rightPanelStore.close();
    return;
  }
  rightPanelStore.openQueue();
};

const toggleTimeDisplayMode = () => {
  if (playerStore.isLiveStream) return;
  timeDisplayMode.value = timeDisplayMode.value === "total" ? "remaining" : "total";
};

const { currentTime: displayedTime, duration: displayedDuration } = useDisplayedPlaybackTime();

const timeDisplay = computed(() => {
  if (playerStore.isLiveStream) return { current: "🔴", duration: "LIVE" };

  const duration = displayedDuration.value;
  if (duration === null) return { current: formatDuration(0), duration: "–:––" };

  const remainingTime = Math.max(duration - displayedTime.value, 0);

  return {
    current: timeDisplayMode.value === "remaining"
      ? `-${formatDuration(remainingTime)}`
      : formatDuration(displayedTime.value),
    duration: formatDuration(duration),
  };
});

const trackChaptersId = computed<TrackId>(() => {
  const track = playerStore.currentTrack;
  if (!track || !isLibraryTrack(track)) return "" as TrackId;
  return track.id;
});

const { data: chaptersData } = useTrackChapters(trackChaptersId);

const sortedChapters = computed(() => {
  const list = chaptersData.value ?? [];
  return [...list].sort((a, b) => a.time - b.time);
});

const activeChapterSegment = computed<{ title: string; time: string } | null>(() => {
  const chapters = sortedChapters.value;
  const currentTime = playerStore.currentTime;
  if (chapters.length === 0) return null;

  if (currentTime < chapters[0].time) {
    return { title: t("player.chapterIntro"), time: formatDuration(chapters[0].time) };
  }

  for (let i = chapters.length - 1; i >= 0; i--) {
    if (currentTime >= chapters[i].time) {
      return {
        title: chapters[i].title || t("chapters.untitled"),
        time: formatDuration(chapters[i].time),
      };
    }
  }

  return null;
});

const isChaptersOpen = computed(() =>
  rightPanelStore.isOpen && rightPanelStore.view === "chapters",
);

const toggleChaptersPanel = () => {
  const track = playerStore.currentTrack;
  if (!track || track.kind !== "library") return;

  if (isChaptersOpen.value) {
    rightPanelStore.close();
    return;
  }
  rightPanelStore.openChapters({ track });
};

</script>
