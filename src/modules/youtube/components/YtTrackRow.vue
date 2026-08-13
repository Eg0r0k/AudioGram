<template>
  <div
    data-track-row
    class="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/60"
  >
    <button
      type="button"
      class="group flex min-w-0 flex-1 items-center gap-3 text-left"
      :disabled="disabled"
      @click="emit('play', item)"
    >
      <div
        class="relative shrink-0 overflow-hidden rounded bg-muted"
        :class="wide ? 'h-12 w-20' : 'size-12'"
      >
        <img
          v-if="item.thumbnail"
          :src="proxiedThumbnail(item.thumbnail, THUMB_SIZE_ROW)"
          alt=""
          loading="lazy"
          class="h-full w-full object-cover"
        >
        <span
          class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100"
          :class="{ 'opacity-100': isResolving }"
        >
          <IconLoader
            v-if="isResolving"
            class="size-5 animate-spin text-white"
          />
          <IconPlay
            v-else
            class="size-5 text-white"
          />
        </span>
      </div>

      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ item.title }}
        </p>
        <p
          v-if="item.artist"
          class="truncate text-xs text-muted-foreground"
        >
          {{ item.artist }}
        </p>
        <p
          v-if="downloadError"
          class="truncate text-xs text-destructive"
        >
          {{ downloadError }}
        </p>
      </div>
    </button>

    <span
      v-if="item.duration"
      class="shrink-0 text-xs tabular-nums text-muted-foreground"
    >
      {{ formatDuration(item.duration) }}
    </span>

    <slot>
      <YtDownloadButton
        :item="item"
        compact
      />
    </slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { formatDuration } from "@/lib/format/time";
import { proxiedThumbnail, THUMB_SIZE_ROW } from "../lib/thumbnail";
import { useYoutubeStore } from "../store/youtube.store";
import type { YtPlayable } from "../types";
import YtDownloadButton from "./YtDownloadButton.vue";
import IconLoader from "~icons/tabler/loader-2";
import IconPlay from "~icons/tabler/player-play-filled";

const props = defineProps<{
  item: YtPlayable;
  /** 20×12 video-style thumbnail instead of the square music cover. */
  wide?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  play: [item: YtPlayable];
}>();

const store = useYoutubeStore();

const isResolving = computed(() => store.resolvingId === props.item.id);
const downloadError = computed(() => {
  const state = store.downloads[props.item.id];
  return state?.status === "error" ? state.error : null;
});
</script>
