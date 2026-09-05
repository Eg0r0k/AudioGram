<template>
  <component
    :is="Item"
    @click="emit('select')"
  >
    <IconSelect class="size-5.5" />
    {{ $t("track.contextMenu.select") }}
  </component>
</template>

<script setup lang="ts">
import IconSelect from "~icons/tabler/select";
import { useTrackMenuComponents } from "../useTrackMenuComponents";

const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  select: [];
}>();
</script>
