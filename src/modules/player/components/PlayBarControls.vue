<template>
  <div class="max-w-[722px] w-[40%]">
    <div class="flex flex-col w-full">
      <div class="flex gap-4 items-center w-full">
        <div class="flex flex-1 gap-2 justify-end">
          <Button
            class="rounded-full"
            size="icon"
            variant="ghost"
            :class="{ 'text-primary': queueStore.isShuffled }"
            :aria-label="$t('player.shuffle')"
            @click="queueStore.toggleShuffle()"
          >
            <IconShuffle class="size-4.5" />
          </Button>
          <Button
            class="rounded-full"
            size="icon"
            variant="ghost"
            :disabled="!queueStore.hasPrevious"
            :aria-label="$t('player.previousTrack')"
            @click="queueStore.previous()"
          >
            <IconPlayerTrackPrevFilled class="size-5" />
          </Button>
        </div>

        <PlayButton />

        <div class="flex flex-1 gap-2">
          <Button
            class="rounded-full"
            size="icon"
            variant="ghost"
            :disabled="!queueStore.hasNext"
            :aria-label="$t('player.nextTrack')"
            @click="queueStore.next()"
          >
            <IconPlayerTrackNextFilled class="size-5" />
          </Button>
          <Button
            class="rounded-full"
            size="icon"
            variant="ghost"
            :class="repeatModeClass"
            :aria-label="$t('player.repeat')"
            @click="queueStore.toggleRepeat"
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import PlayButton from "./PlayButton.vue";
import IconShuffle from "~icons/tabler/arrows-shuffle-2";
import IconPlayerTrackPrevFilled from "~icons/tabler/player-track-prev-filled";
import IconPlayerTrackNextFilled from "~icons/tabler/player-track-next-filled";
import IconRepeat from "~icons/tabler/repeat";
import IconRepeatOnce from "~icons/tabler/repeat-once";
import { useQueueStore } from "@/modules/queue/store/queue.store";

const queueStore = useQueueStore();
const repeatModeClass = computed(() => ({
  "text-primary": queueStore.repeatMode !== "off",
}));
</script>
