<template>
  <div class="flex items-center justify-between mt-6 landscape-short:mt-3">
    <Button
      size="icon-lg"
      variant="ghost"
      class="rounded-full"
      :class="queueStore.isShuffled ? 'text-primary' : 'text-white'"
      :aria-label="$t('player.shuffle')"
      @click.stop="queueStore.toggleShuffle()"
    >
      <IconShuffle class="size-6" />
    </Button>
    <Button
      size="icon-lg"
      variant="ghost"
      class="rounded-full text-white"
      :disabled="!queueStore.hasPrevious"
      :aria-label="$t('player.previousTrack')"
      @click.stop="queueStore.previous()"
    >
      <IconBack class="size-6" />
    </Button>
    <PlayButton
      class="size-15!"
      @click.stop
    />
    <Button
      size="icon-lg"
      variant="ghost"
      class="rounded-full text-white"
      :disabled="!queueStore.hasNext"
      :aria-label="$t('player.nextTrack')"
      @click.stop="queueStore.next()"
    >
      <IconForvard class="size-6" />
    </Button>
    <Button
      size="icon-lg"
      variant="ghost"
      class="rounded-full"
      :class="queueStore.repeatMode !== 'off' ? 'text-primary' : 'text-white'"
      :aria-label="$t('player.repeat')"
      @click.stop="queueStore.toggleRepeat"
    >
      <IconRepeatOnce
        v-if="queueStore.repeatMode === 'one'"
        class="size-6"
      />
      <IconRepeat
        v-else
        class="size-6"
      />
    </Button>
  </div>
</template>
<script setup lang="ts">
import { Button } from "@/components/ui/button";
import PlayButton from "@/modules/player/components/PlayButton.vue";
import { useQueueStore } from "@/modules/queue/store/queue.store";

import IconShuffle from "~icons/tabler/arrows-shuffle";
import IconBack from "~icons/tabler/player-skip-back-filled";
import IconForvard from "~icons/tabler/player-skip-forward-filled";
import IconRepeat from "~icons/tabler/repeat";
import IconRepeatOnce from "~icons/tabler/repeat-once";

const queueStore = useQueueStore();
</script>
