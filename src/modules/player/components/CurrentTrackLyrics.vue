<template>
  <section
    v-if="track"
    :class="sectionClass"
  >
    <div
      v-if="lyricsStore.status === 'loading'"
      class="space-y-5 pt-2 text-center"
    >
      <Skeleton
        v-for="(width, i) in SKELETON_WIDTHS"
        :key="i"
        :style="{ width }"
        class="mx-auto h-5 sm:h-7"
      />
    </div>

    <div
      v-else-if="lyricsStore.lines.length > 0"
      :class="linesClass"
    >
      <button
        v-for="(line, index) in lyricsStore.lines"
        :ref="element => setLineRef(element, index)"
        :key="`${line.time}-${index}`"
        type="button"
        :class="getLineClass(index, line.text)"
        @click="handleLineClick(line.time)"
      >
        {{ line.text || "\u00A0" }}
      </button>
    </div>

    <p
      v-else
      class="pt-6 text-center text-lg text-muted-foreground sm:text-xl"
    >
      {{ placeholderText }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { type ComponentPublicInstance, computed, nextTick, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useLyricsStore } from "@/modules/player/store/lyrics.store";
import type { Track } from "@/modules/player/types";

const SKELETON_WIDTHS = ["55%", "72%", "48%", "66%", "38%", "60%", "44%"];

const props = withDefaults(defineProps<{
  variant?: "fullscreen" | "panel";
}>(), {
  variant: "fullscreen",
});

const playerStore = usePlayerStore();
const lyricsStore = useLyricsStore();
const { t } = useI18n();
const lineRefs: Array<HTMLElement | null> = [];
let lastActiveIndex = -1;

const track = computed<Track | null>(() => {
  const currentTrack = playerStore.currentTrack;
  return currentTrack?.kind === "library" ? currentTrack : null;
});

const placeholderText = computed(() => {
  if (lyricsStore.status === "error") {
    return t("player.lyricsLoadFailed");
  }
  return t("player.lyricsEmpty");
});

const sectionClass = computed(() => {
  if (props.variant === "panel") {
    return "mx-auto w-full px-2 pb-8";
  }

  return "mx-auto w-full max-w-3xl px-4 pb-12 sm:px-6";
});

const linesClass = computed(() => {
  return props.variant === "panel" ? "space-y-4 text-center" : "space-y-5 text-center";
});

const stopWatch = watch(
  () => lyricsStore.activeLineIndex,
  async (index) => {
    if (index < 0 || index === lastActiveIndex) return;
    lastActiveIndex = index;
    await nextTick();
    lineRefs[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
  },
);

onUnmounted(() => {
  stopWatch();
  lineRefs.length = 0;
});

function setLineRef(element: Element | ComponentPublicInstance | null, index: number) {
  lineRefs[index] = element instanceof HTMLElement ? element : null;
}

function handleLineClick(time: number) {
  if (!playerStore.canSeek) return;
  playerStore.seekTo(time);
}

function getLineClass(index: number, text: string): string {
  const isActive = index === lyricsStore.activeLineIndex;

  if (isActive) {
    if (props.variant === "panel") {
      return "lyrics-line-active block w-full cursor-pointer bg-transparent text-center text-2xl font-semibold leading-tight tracking-tight text-foreground";
    }

    return "lyrics-line-active block w-full cursor-pointer bg-transparent text-center text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl";
  }

  if (!text.trim()) {
    return "lyrics-line-inactive block h-6 w-full bg-transparent sm:h-8";
  }

  if (props.variant === "panel") {
    return "lyrics-line-inactive block w-full cursor-pointer bg-transparent text-center text-lg leading-relaxed text-muted-foreground/55";
  }

  return "lyrics-line-inactive block w-full cursor-pointer bg-transparent text-center text-xl leading-relaxed text-muted-foreground/55 sm:text-2xl";
}
</script>

<style scoped>
.lyrics-line-active,
.lyrics-line-inactive {
  transition:
    color 220ms ease,
    opacity 220ms ease,
    transform 260ms ease,
    filter 220ms ease;
}

.lyrics-line-active {
  opacity: 1;
  filter: blur(0);
  transform: scale(1);
}

.lyrics-line-inactive {
  opacity: 0.58;
  filter: blur(0.2px);
  transform: scale(0.985);
}
</style>
