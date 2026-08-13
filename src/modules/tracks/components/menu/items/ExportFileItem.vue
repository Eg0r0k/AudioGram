<template>
  <component
    :is="Item"
    @click="emit('export')"
  >
    <IconDownload class="size-5.5" />
    {{ $t("track.contextMenu.exportFile") }}
  </component>
</template>

<script setup lang="ts">
import IconDownload from "~icons/tabler/download";
import { useTrackMenuComponents } from "../useTrackMenuComponents";

const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  export: [];
}>();
</script>
