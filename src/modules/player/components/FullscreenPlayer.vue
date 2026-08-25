<template>
  <section class="flex h-screen w-full flex-col bg-background text-foreground">
    <div class="flex shrink-0 items-center justify-between px-4 py-4 sm:px-6">
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-lg font-bold sm:text-xl">
          {{ track?.title }}
        </span>
        <span class="truncate text-sm font-medium text-muted-foreground sm:text-base">
          {{ track?.artist }}
        </span>
      </div>

      <Button
        class="rounded-full"
        size="icon-lg"
        variant="ghost"
        @click="emit('close')"
      >
        <IconX class="size-6" />
      </Button>
    </div>

    <div class="flex min-h-0 flex-1">
      <div class="flex w-1/2 shrink-0 items-center justify-center p-8 @container-[size] xl:p-12">
        <div class="aspect-square w-[min(100cqw,100cqh)] select-none overflow-hidden rounded-2xl bg-muted shadow-2xl">
          <NuxtImage
            v-slot="{ imgAttrs, isLoaded, src }"
            :src="coverUrl"
            fallback-src="/img/fallback.svg"
            :alt="track?.title ?? ''"
            custom
          >
            <img
              :key="src"
              v-bind="imgAttrs"
              :src="src"
              :alt="track?.title ?? ''"
              draggable="false"
              class="size-full object-cover transition-[transform,opacity] duration-180 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-150"
              :class="isLoaded ? 'scale-100 opacity-100' : 'scale-[1.02] opacity-0 motion-reduce:scale-100'"
            >
          </NuxtImage>
        </div>
      </div>

      <Scrollable class="min-h-0 min-w-0 flex-1">
        <div class="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center px-6 pb-12 pt-4 xl:px-10">
          <CurrentTrackLyrics />
        </div>
      </Scrollable>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import NuxtImage from "@/components/ui/image/NuxtImage.vue";
import { Scrollable } from "@/components/ui/scrollable";
import IconX from "~icons/tabler/x";
import { useCurrentTrackCover } from "../composables/useCurrentTrackCover";
import CurrentTrackLyrics from "./CurrentTrackLyrics.vue";

const emit = defineEmits<{
  close: [];
}>();

const { track, coverUrl } = useCurrentTrackCover();
</script>
