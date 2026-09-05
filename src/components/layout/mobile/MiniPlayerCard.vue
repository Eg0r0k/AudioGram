<template>
  <div
    class="relative size-full rounded-lg overflow-hidden transition-colors duration-300"
    :style="{ background }"
  >
    <div class="flex items-center gap-2.5 px-2 h-14">
      <div class="size-10 shrink-0 rounded-md overflow-hidden flex items-center justify-center bg-black/20">
        <NuxtImage
          :src="coverUrl"
          :alt="title"
          fallback-src="/img/fallback.svg"
          loading="eager"
          decoding="sync"
          class="size-full object-cover"
        />
      </div>

      <div
        v-if="marquee"
        class="flex-1 min-w-0 flex flex-col gap-px"
      >
        <MarqueeBlock
          :duration="10"
          animate-on-overflow-only
          pause-on-hover
          gradient
          :gradient-color="gradientColor"
          gradient-length="20px"
        >
          <span class="text-sm font-medium leading-snug text-white">
            {{ title }}
          </span>
        </MarqueeBlock>
        <MarqueeBlock
          :duration="10"
          animate-on-overflow-only
          pause-on-hover
          gradient
          :gradient-color="gradientColor"
          gradient-length="20px"
        >
          <span class="text-[11px] text-white/80">
            {{ artist }}
          </span>
        </MarqueeBlock>
      </div>
      <div
        v-else
        class="flex-1 min-w-0 flex flex-col gap-px"
      >
        <span class="truncate text-sm font-medium leading-snug text-white">
          {{ title }}
        </span>
        <span class="truncate text-[11px] text-white/80">
          {{ artist }}
        </span>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <slot name="actions">
          <span class="flex size-10 items-center justify-center text-white">
            <IconPlay class="size-6" />
          </span>
          <span class="flex size-10 items-center justify-center text-white">
            <IconPlaylist class="size-5" />
          </span>
        </slot>
      </div>
    </div>

    <MiniPlayerProgress v-if="showProgress" />
  </div>
</template>

<script setup lang="ts">
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import MarqueeBlock from "@/components/ui/marquee/MarqueeBlock.vue";
import MiniPlayerProgress from "./MiniPlayerProgress.vue";
import IconPlaylist from "~icons/tabler/playlist";
import IconPlay from "~icons/tabler/player-play-filled";

// The neighbour cards are dimmed previews: plain truncated text there saves
// two marquees (a ResizeObserver and layout reads each) per card on every
// track change.
withDefaults(defineProps<{
  title: string;
  artist: string;
  coverUrl?: string;
  background: string;
  gradientColor: string;
  showProgress?: boolean;
  marquee?: boolean;
}>(), { marquee: true });
</script>
