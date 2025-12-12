<template>
  <ContextMenuSub>
    <ContextMenuSubTrigger>
      <Icon
        icon="tabler:playlist-add"
        class="mr-2"
      />
      Добавить в плейлист
    </ContextMenuSubTrigger>
    <ContextMenuSubContent class="w-56">
      <div class="p-0.5 ">
        <InputGroup
          class="bg-background!"
          size="sm"
        >
          <InputGroupInput
            v-model="searchQuery"
            placeholder="Поиск плейлиста..."
            @keydown.stop
          />
          <InputGroupAddon>
            <Icon
              icon="tabler:search"
              class="size-4 text-muted-foreground"
            />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <ContextMenuSeparator />

      <ContextMenuItem @click="emit('create')">
        <Icon icon="tabler:plus" />
        Создать плейлист
      </ContextMenuItem>

      <template v-if="filteredPlaylists.length">
        <ContextMenuSeparator />
        <div class="max-h-48 overflow-y-auto">
          <ContextMenuItem
            v-for="playlist in filteredPlaylists"
            :key="playlist.id"
            @click="emit('add', playlist.id)"
          >
            <Icon icon="tabler:playlist" />
            <span class="truncate">{{ playlist.name }}</span>
          </ContextMenuItem>
        </div>
      </template>

      <template v-else-if="searchQuery && playlists.length">
        <ContextMenuSeparator />
        <div class="p-3 text-center text-sm text-muted-foreground">
          Плейлисты не найдены
        </div>
      </template>

      <template v-else-if="!playlists.length">
        <ContextMenuSeparator />
        <div class="p-3 text-center text-sm text-muted-foreground">
          У вас пока нет плейлистов
        </div>
      </template>
    </ContextMenuSubContent>
  </ContextMenuSub>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import {
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import { Icon } from "@iconify/vue";
import type { PlaylistId } from "@/types/ids";

interface Playlist {
  id: PlaylistId;
  name: string;
}

const props = defineProps<{
  playlists: Playlist[];
}>();

const emit = defineEmits<{
  add: [playlistId: PlaylistId];
  create: [];
}>();

const searchQuery = ref("");

const filteredPlaylists = computed(() => {
  if (!searchQuery.value.trim()) {
    return props.playlists;
  }

  const query = searchQuery.value.toLowerCase().trim();
  return props.playlists.filter(playlist =>
    playlist.name.toLowerCase().includes(query),
  );
});
</script>
