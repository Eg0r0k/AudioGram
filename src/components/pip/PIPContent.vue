<template>
  <div class="pip-container ">
    <div class="content-cover">
      <div class="content" />
    </div>

    <div class="controls">
      <VolumeButton />
      <Button
        class="rounded-full"
        size="icon-sm"
        variant="ghost"
      >
        <Icon
          class="size-4.5"
          icon="tabler:arrows-shuffle-2"
        />
      </Button>

      <Button
        class="rounded-full"
        size="icon-sm"
        variant="ghost"
      >
        <Icon
          class="size-4.5"
          icon="tabler:player-track-prev-filled"
        />
      </Button>
      <PlayButton class="size-10" />
      <Button
        class="rounded-full"
        size="icon-sm"
        variant="ghost"
      >
        <Icon
          class="size-4.5"
          icon="tabler:player-track-next-filled"
        />
      </Button>
      <Button
        class="rounded-full"
        size="icon-sm"
        variant="ghost"
      >
        <Icon
          class="size-4.5"
          icon="material-symbols:repeat-rounded"
        />
      </Button>
      <Button
        class="rounded-full"
        size="icon-sm"
        variant="ghost"
      >
        <Icon
          class="size-4.5"
          icon="material-symbols:repeat-rounded"
        />
      </Button>
    </div>

    <div class="context-info">
      <MarqueeBlock
        :duration="3"
        animate-on-overflow-only
        pause-on-hover
        gradient
        gradient-color="var(--background)"
        gradient-length="20px"
      >
        <span class=" context-info__title">TITLE</span>
      </MarqueeBlock>

      <MarqueeBlock
        :duration="6"
        animate-on-overflow-only
        pause-on-hover
        gradient
        gradient-color="var(--background)"
        gradient-length="20px"
      >
        <span class=" context-info__sub">Subtitlasdasdasdasdsadase</span>
      </MarqueeBlock>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { Button } from "@/components/ui/button";
import PlayButton from "../player/PlayButton.vue";
import VolumeButton from "../player/actions/VolumeButton.vue";
import MarqueeBlock from "../ui/marquee/MarqueeBlock.vue";
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
}

.content-cover {
  background: var(--color-muted);
  grid-area: media;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 4px 4px 0;
  border-radius: 8px;
  min-height: 40px;
}

.content {
  aspect-ratio: 1;
  width: auto;
  height: 100%;
  max-width: 100%;
  background-image: url("/test.jfif");
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  border-radius: 8px;
}
.controls {
  grid-area: controls;
  display: flex;
  align-items: center;
  justify-content: center;
}

.context-info {
  grid-area: contextinfo;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 0 8px;
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
  .context-info__title {
    font-size: 16px;
  }
  .context-info__sub{
    font-size: 12px;
  }

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
