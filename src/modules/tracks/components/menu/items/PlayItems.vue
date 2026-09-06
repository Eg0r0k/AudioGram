<template>
  <component
    :is="Item"
    @click="emit('playNext')"
  >
    <IconPlayerTrackNext
      class="size-5.5"
    />
    {{ $t('track.contextMenu.playNext') }}
  </component>

  <component
    :is="Item"
    @click="emit('addToQueue')"
  >
    <IconListNumbers
      class="size-5.5"
    />
    {{ $t('track.contextMenu.addToQueue') }}
  </component>
</template>

<script setup lang="ts">
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import IconPlayerTrackNext from "~icons/tabler/player-track-next";
import IconListNumbers from "~icons/tabler/list-numbers";

defineOptions({
  inheritAttrs: false,
});
const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  play: [];
  playNext: [];
  addToQueue: [];
}>();
</script>
