<template>
  <div class="pip-root @container">
    <div class="pip-container">
      <div
        class="content-cover"
        :style="contentCoverStyle"
      >
        <div class="content">
          <img
            v-if="showCover"
            :src="coverUrl"
            :alt="currentTrack?.title ?? ''"
            class="cover-image"
            draggable="false"
            @error="coverLoadFailed = true"
          >

          <div
            v-else
            class="content-fallback bg-accent"
            :style="fallbackIconStyle"
          >
            <IconMusic class="content-fallback__icon text-white" />
          </div>
        </div>
      </div>

      <div class="controls">
        <Button
          class="control-extra rounded-full"
          size="icon-sm"
          variant="ghost"
          :class="{ 'text-primary': queueStore.isShuffled }"
          @click="queueStore.toggleShuffle()"
        >
          <IconArrowsShuffle2 class="size-4.5" />
        </Button>
        <VolumeButton />
        <Button
          class="control-previous control-extra rounded-full"
          size="icon-sm"
          variant="ghost"
          :disabled="!queueStore.hasPrevious"
          @click="queueStore.previous()"
        >
          <IconPlayerTrackPrevFilled class="size-4.5" />
        </Button>

        <span class="control-play">
          <PlayButton class="size-10" />
        </span>

        <Button
          class="control-next rounded-full"
          size="icon-sm"
          variant="ghost"
          :disabled="!queueStore.hasNext"
          @click="queueStore.next()"
        >
          <IconPlayerTrackNextFilled class="size-4.5" />
        </Button>

        <Button
          class="control-extra rounded-full"
          size="icon-sm"
          variant="ghost"
          :class="{ 'text-primary': queueStore.repeatMode !== 'off' }"
          @click="queueStore.toggleRepeat()"
        >
          <IconRepeatOnce
            v-if="queueStore.repeatMode === 'one'"
            class="size-4.5"
          />
          <IconRepeat
            v-else
            class="size-4.5"
          />
        </Button>

        <Button
          class="control-extra rounded-full"
          size="icon-sm"
          variant="ghost"
          :class="{ 'text-primary': isLiked }"
          @click="toggleLike"
        >
          <IconLikedFilled
            v-if="isLiked"
            class="size-4.5"
          />
          <IconLike
            v-else
            class="size-4.5"
          />
        </Button>
      </div>

      <div class="context-info">
        <MarqueeBlock
          :duration="6"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="var(--background)"
          gradient-length="20px"
        >
          <span class="context-info__title">
            {{ currentTrack?.title ?? "—" }}
          </span>
        </MarqueeBlock>

        <MarqueeBlock
          :duration="6"
          animate-on-overflow-only
          pause-on-hover
          gradient
          gradient-color="var(--background)"
          gradient-length="20px"
        >
          <span class="context-info__sub">
            {{ currentTrack?.artist ?? "" }}
          </span>
        </MarqueeBlock>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useToggleTrackLike } from "@/modules/tracks/composables/useToggleTrackLike";
import { useMobilePlayerColor } from "@/modules/player/composables/useMobilePlayerColor";
import { Button } from "@/components/ui/button";
import PlayButton from "@/modules/player/components/PlayButton.vue";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import type { Track } from "@/modules/player/types";
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import IconArrowsShuffle2 from "~icons/tabler/arrows-shuffle-2";
import IconPlayerTrackPrevFilled from "~icons/tabler/player-track-prev-filled";
import IconPlayerTrackNextFilled from "~icons/tabler/player-track-next-filled";
import IconRepeat from "~icons/tabler/repeat";
import IconRepeatOnce from "~icons/tabler/repeat-once";
import IconMusic from "~icons/tabler/music";
import VolumeButton from "../actions/VolumeButton.vue";

const playerStore = usePlayerStore();
const queueStore = useQueueStore();
const { toggleTrackLike } = useToggleTrackLike();

const currentTrack = computed<Track | null>(() => {
  const track = playerStore.currentTrack;
  return track?.kind === "library" ? track : null;
});

const isLiked = computed(() => currentTrack.value?.isLiked ?? false);

const { color: playerColor, coverUrl } = useMobilePlayerColor();

const coverLoadFailed = ref(false);

watch(
  coverUrl,
  () => {
    coverLoadFailed.value = false;
  },
  { immediate: true },
);

const showCover = computed(() => !!coverUrl.value && !coverLoadFailed.value);

const contentCoverStyle = computed(() => ({
  background: `linear-gradient(to bottom, ${playerColor.value.hsl}, color-mix(in srgb, ${playerColor.value.hsl} 20%, black))`,

}));

const fallbackIconStyle = computed(() => ({
  color: playerColor.value.isDark
    ? "rgba(255, 255, 255, 0.72)"
    : "rgba(0, 0, 0, 0.60)",
}));

const toggleLike = async () => {
  if (!currentTrack.value) return;
  await toggleTrackLike(currentTrack.value);
};
</script>

<style lang="css">
:root {
  --context-info-height: 64px;
  --controls-height: 48px;
}

html, body, #app {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  scrollbar-color: hsla(0, 0%, 100%, .3) transparent;
  scrollbar-width: auto;
}
</style>

<style lang="css" scoped>
.pip-root {
  width: 100%;
  height: 100%;
  min-height: 100vh;
}

.pip-container {
  display: grid;
  user-select: none;
  grid-template-areas:
    "media media"
    "contextinfo controls";
  grid-template-rows: 1fr var(--context-info-height);
  grid-template-columns: 1fr auto;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  min-width: 0;
}

.content-cover {
  grid-area: media;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 4px 4px 0;
  border-radius: 8px;
  min-height: 40px;
  min-width: 0;
  overflow: hidden;
  transition: background 220ms ease;
}

.content {
  aspect-ratio: 1;
  width: auto;
  margin: 8px;
  height: 100%;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  user-select: none;
  pointer-events: none;
}

.content-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.content-fallback__icon {
  width: clamp(28px, 16%, 72px);
  height: clamp(28px, 16%, 72px);
}

.controls {
  grid-area: controls;
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.control-play {
  display: flex;
}

.context-info {
  grid-area: contextinfo;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 0 8px;
  min-width: 0;
  overflow: hidden;
}

.context-info__title {
  font-weight: 700;
  font-size: clamp(16px, 3vw, 24px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-info__sub {
  font-weight: 500;
  color: var(--color-muted-foreground);
  font-size: clamp(12px, 3vw, 18px);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@container (max-width: 360px) {
  .pip-container {
    grid-template-areas:
      "media"
      "contextinfo"
      "controls";
    grid-template-rows: minmax(0, 1fr) auto var(--controls-height);
    grid-template-columns: minmax(0, 1fr);
  }

  .content-cover {
    margin: 4px 4px 0;
  }
   .content {
      margin: 0;
    }

  .context-info {
    padding: 4px 12px 0;
    line-height: 1.15;
  }

  .controls {
    align-self: center;
    width: 100%;
    padding: 2px 4px 6px;
    gap: 2px;
  }
}

@container (max-width: 240px) {
  .pip-container {
    grid-template-rows: minmax(0, 1fr) auto auto;
  }

  .controls {
    flex-wrap: wrap;
    align-content: center;
  }
}

@media (max-height: 170px) {
  .pip-container {
    gap: 4px;
    grid-template-areas:
      "media contextinfo"
      "controls controls";
    grid-template-rows: 1fr var(--controls-height);
    grid-template-columns: auto 1fr;
    padding: 4px;
  }

  .content-cover {
    margin: auto 0;
    aspect-ratio: 1;
    min-width: 60px;
    max-height: 100%;
  }

  .controls {
    background: transparent;
    border-radius: 8px;
    padding: 4px 8px;
  }

  .context-info {
    padding: 0 8px;
  }

  @container (max-width: 360px) {
    .pip-container {
      gap: 4px 8px;
      grid-template-areas:
        "media contextinfo"
        "media controls";
      grid-template-rows: minmax(0, 1fr) auto;
      grid-template-columns: auto minmax(0, 1fr);
      padding: 4px;
    }

    .content-cover {
      height: 100%;
      min-width: 96px;
      max-width: 124px;
    }

    .content {
      margin: 0;
    }

    .context-info {
      align-items: flex-start;
      justify-content: end;
      padding: 4px 4px 0 0;
      line-height: 1.1;
    }

    .context-info__title {
      font-size: 16px;
    }

    .context-info__sub {
      font-size: 12px;
    }

    .controls {
      align-self: end;
      justify-content: flex-start;
      width: auto;
      padding: 0 0 2px;
      gap: 4px;
    }

    .control-extra {
      display: none;
    }

    .control-play {
      order: 1;
    }

    .control-next {
      order: 2;
    }

    .control-previous {
      order: 3;
    }
  }
}

@media (min-height: 171px) {
  .controls {
    background: transparent;
  }
}

@media (max-height: 132px) {
  .pip-container {
    grid-template-areas: "media contextinfo controls";
    grid-template-columns: auto 1fr auto;
    grid-template-rows: 1fr;
    padding: 8px 4px;
    gap: 8px;
  }

  .content-cover {
    grid-area: media;
    order: 1;
    margin: 0;
    aspect-ratio: 1;
    min-width: 40px;
    height: 100%;
  }
 .content {
      margin: 0;
    }

  .context-info {
    grid-area: contextinfo;
    order: 2;
    display: flex !important;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    min-width: 0;
    line-height: 1.1;
    overflow: hidden;
  }

  .context-info__title { font-size: 16px; }
  .context-info__sub { font-size: 12px; }

  .controls {
    grid-area: controls;
    order: 3;
    background: transparent;
    border-radius: 0;
    padding: 0 4px;
    justify-content: flex-end;
    flex-shrink: 0;
    gap: 2px;
  }
}
</style>
