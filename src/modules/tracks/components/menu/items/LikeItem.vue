<template>
  <component
    :is="Item"
    @click="emit('toggle')"
  >
    <IconLikedFilled
      v-if="isLiked"
      class="size-5.5 text-primary"
    />
    <IconLike
      v-else
      class="size-5.5 text-primary"
    />
    {{
      !isLiked
        ? $t("track.contextMenu.addToFavorites")
        : $t("track.contextMenu.removeFromFavorites")
    }}
  </component>
</template>
<script setup lang="ts">
import IconLike from "~icons/tabler/heart";
import IconLikedFilled from "~icons/tabler/heart-filled";
import { useTrackMenuComponents } from "../useTrackMenuComponents";

defineProps<{
  isLiked: boolean;
}>();

const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  toggle: [];
}>();
</script>
