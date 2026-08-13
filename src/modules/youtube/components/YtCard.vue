<template>
  <button
    type="button"
    class="group flex w-36 shrink-0 flex-col gap-2 rounded-lg p-2 text-left transition-colors hover:bg-muted/60"
    @click="emit('open')"
  >
    <div
      class="relative aspect-square w-full overflow-hidden bg-muted"
      :class="round ? 'rounded-full' : 'rounded-md'"
    >
      <img
        v-if="thumbnail"
        :src="proxiedThumbnail(thumbnail, THUMB_SIZE_CARD)"
        alt=""
        loading="lazy"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      >
      <div
        v-else
        class="flex h-full w-full items-center justify-center text-muted-foreground"
      >
        <IconMusic class="size-8" />
      </div>
    </div>
    <div class="min-w-0 w-full">
      <p class="truncate text-sm font-medium">
        {{ title }}
      </p>
      <p
        v-if="subtitle"
        class="truncate text-xs text-muted-foreground"
      >
        {{ subtitle }}
      </p>
    </div>
  </button>
</template>

<script setup lang="ts">
import { proxiedThumbnail, THUMB_SIZE_CARD } from "../lib/thumbnail";
import IconMusic from "~icons/tabler/music";

defineProps<{
  title: string;
  subtitle?: string | null;
  thumbnail?: string | null;
  /** Circular cover (artists). */
  round?: boolean;
}>();

const emit = defineEmits<{
  open: [];
}>();
</script>
