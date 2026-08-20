<template>
  <button
    type="button"
    class="group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-accent/50 w-full text-left"
    :class="{
      'bg-primary/10 hover:bg-primary/15': isCurrent,
      'opacity-50': isPrevious,
      'opacity-30': isBeingDragged,
    }"
    @click="$emit('play')"
  >
    <span
      class="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
      :aria-label="$t('queue.drag')"
      @pointerdown="$emit('dragStart', $event)"
      @click.stop
    >
      <IconGripVertical class="size-4" />
    </span>

    <div class="size-10 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
      <NuxtImage
        :src="coverUrl"
        :alt="item.track.title"
        fallback-src="/img/fallback.svg"
        class="size-full object-cover"
      />
    </div>

    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
      <span
        class="text-sm font-medium truncate"
        :class="isCurrent ? 'text-primary' : 'text-foreground'"
      >
        {{ item.track.title }}
      </span>
      <span class="text-xs text-muted-foreground truncate">
        {{ item.track.artist }}
      </span>
    </div>

    <span class="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right sm:group-hover:hidden">
      {{ formattedDuration }}
    </span>

    <Button
      variant="ghost"
      size="icon-sm"
      class="rounded-full shrink-0 hidden sm:opacity-0 sm:group-hover:flex sm:group-hover:opacity-100 transition-opacity"
      :aria-label="$t('queue.remove')"
      @click.stop="$emit('remove')"
    >
      <IconX class="size-4" />
    </Button>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";
import type { QueueItem } from "../types";
import { formatDuration } from "@/lib/format/time";
import { Button } from "@/components/ui/button";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import IconGripVertical from "~icons/tabler/grip-vertical";
import IconX from "~icons/tabler/x";

const props = defineProps<{
  item: QueueItem;
  isCurrent?: boolean;
  isPrevious?: boolean;
  isBeingDragged?: boolean;
}>();

defineEmits<{
  play: [];
  remove: [];
  dragStart: [event: PointerEvent];
}>();

const formattedDuration = computed(() => {
  const track = props.item.track;
  const dur = "duration" in track ? track.duration : undefined;
  return dur ? formatDuration(dur) : "--:--";
});

const albumId = computed(() => {
  const track = props.item.track;
  return "albumId" in track ? track.albumId : null;
});

const { url: coverBlobUrl } = useEntityCover("album", albumId);

// Ephemeral tracks (YT streams, radio) carry their artwork on the track
// itself — the library blob lookup only ever resolves for album-backed rows.
const coverUrl = computed(() => {
  const track = props.item.track;
  const trackCover = "cover" in track ? track.cover : undefined;
  return props.item.cover ?? trackCover ?? coverBlobUrl.value ?? "/img/fallback.svg";
});
</script>
