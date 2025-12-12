<template>
  <ContextMenuItem @click="emit('goToArtist')">
    <Icon icon="tabler:user" />
    Перейти к исполнителю
  </ContextMenuItem>
  <ContextMenuItem @click="emit('goToAlbum')">
    <Icon icon="tabler:disc" />
    Перейти к альбому
  </ContextMenuItem>
</template>
<script setup lang="ts">
import { ContextMenuItem } from "@/components/ui/context-menu";
import { Icon } from "@iconify/vue";

defineProps<{
  artistName: string;
  albumName: string;
}>();

const emit = defineEmits<{
  goToArtist: [];
  goToAlbum: [];
}>();
</script>
