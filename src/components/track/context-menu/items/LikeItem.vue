<template>
  <ContextMenuItem @click="emit('toggle')">
    <Icon
      :icon="!isLiked ? 'tabler:heart' : 'tabler:heart-filled'"
      :class="{ 'fill-red-400 text-red-400': isLiked }"
    />
    {{ !isLiked ? "Добавь в любимые треки" : "Удалить из любимых треков" }}
  </ContextMenuItem>
</template>
<script setup lang="ts">
import ContextMenuItem from "@/components/ui/context-menu/ContextMenuItem.vue";
import { Icon } from "@iconify/vue";

defineProps<{
  isLiked: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>
