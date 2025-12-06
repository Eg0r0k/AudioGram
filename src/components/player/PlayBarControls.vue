<template>
  <div class="max-w-[722px] w-[40%]">
    <div class="flex flex-col w-full">
      <div class="flex gap-4 items-center mb-2 w-full">
        <div class="flex flex-1 gap-2 justify-end">
          <Button class="rounded-full" size="icon" variant="ghost">
            <Icon class="size-4.5" icon="tabler:arrows-shuffle-2" />
          </Button>
          <Button class="rounded-full" size="icon" variant="ghost">
            <Icon class="size-5" icon="tabler:player-track-prev-filled" />
          </Button>
        </div>
        <PlayButton />
        <div class="flex flex-1 gap-2">
          <Button class="rounded-full" size="icon" variant="ghost">
            <Icon icon="tabler:player-track-next-filled" />
          </Button>
          <Button class="rounded-full" size="icon" variant="ghost">
            <Icon class="size-4.5" icon="material-symbols:repeat-rounded" />
          </Button>
        </div>
      </div>
      <div class="flex justify-between items-center gap-2 w-full">
        <div
          class="text-xs text-muted-foreground min-w-10 text-right select-none"
        >
          0:00:00
        </div>
        <Slider :max="100" :step="0.5" />
        <div
          class="text-xs text-muted-foreground min-w-10 text-left select-none"
        >
          12:00:00
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/vue";
import { Slider } from "@/components/ui/slider";
import PlayButton from "./PlayButton.vue";
</script>
