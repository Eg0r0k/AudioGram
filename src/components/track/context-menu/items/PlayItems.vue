<template>
  <ContextMenuItem @click="emit('play')">
    <Icon icon="tabler:player-play" />
    Воспроизвести
  </ContextMenuItem>

  <ContextMenuItem @click="emit('playNext')">
    <Icon icon="tabler:playlist-add" />
    Воспроизвести следующим
  </ContextMenuItem>

  <ContextMenuItem @click="emit('addToQueue')">
    <Icon icon="tabler:list-numbers" />
    Добавить в очередь
  </ContextMenuItem>
</template>
<script setup lang="ts">
import { ContextMenuItem } from "@/components/ui/context-menu";
import { Icon } from "@iconify/vue";

const emit = defineEmits<{
  play: [];
  playNext: [];
  addToQueue: [];
}>();
</script>
