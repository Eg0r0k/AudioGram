<template>
  <div
    v-ripple
    role="button"
    tabindex="0"
    data-track-row
    :data-track-id="track.id"
    :data-track-index="index"
    :class="[
      'group track-row flex h-16 w-full select-none items-center gap-3 rounded px-2.5 transition-colors',
      'cursor-pointer hover:bg-muted/50 focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:border-ring outline-none',
    ]"
    @click="handleClick"
    @keypress.enter="handleClick"
  >
    <button
      class="flex h-full w-8 shrink-0 items-center justify-center"
      @click.stop="handleClick"
    >
      <Checkbox
        :model-value="isSelected"
        size="lg"
        class="pointer-events-none"
      />
    </button>

    <div class="relative z-10 size-10 shrink-0 overflow-hidden rounded bg-muted">
      <NuxtImage
        :src="coverUrl"
        :alt="track.title"
        fallback-src="/img/fallback.svg"
        class="size-full object-cover"
      />
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <div
        :class="[
          'truncate text-base font-medium',
          isSelected && 'text-primary',
        ]"
      >
        {{ track.title }}
      </div>
      <div class="truncate text-sm text-muted-foreground">
        {{ track.artist }}
      </div>
    </div>

    <span class="shrink-0 text-sm font-medium text-muted-foreground">
      {{ formatDuration(track.duration) }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDuration } from "@/lib/format/time";
import type { Track } from "@/modules/player/types";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";

interface Props {
  track: Track;
  isSelected?: boolean;
  index?: number;
}

const props = withDefaults(defineProps<Props>(), {
  isSelected: false,
  index: 0,
});

const emit = defineEmits<{
  toggleSelect: [track: Track, event: MouseEvent | KeyboardEvent];
}>();

const { url: coverBlobUrl } = useEntityCover("album", () => props.track.albumId);
const coverUrl = computed(() => coverBlobUrl.value ?? "/img/fallback.svg");

function handleClick(event: MouseEvent | KeyboardEvent) {
  emit("toggleSelect", props.track, event);
}
</script>
