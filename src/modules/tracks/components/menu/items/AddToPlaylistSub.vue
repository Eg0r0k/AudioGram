<script setup lang="ts">
import { ref, shallowRef, computed } from "vue";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/components/ui/input-group";
import IconSearch from "~icons/tabler/search";
import IconPlaylistAdd from "~icons/tabler/playlist-add";
import IconPlus from "~icons/tabler/plus";
import IconPlaylist from "~icons/tabler/playlist";
import IconLoader2 from "~icons/tabler/loader-2";
import type { PlaylistId } from "@/types/ids";
import { useTrackMenuComponents } from "../../menu/useTrackMenuComponents";
import { usePlaylistMenu } from "../composables/usePlaylistMenu";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";

const emit = defineEmits<{
  add: [playlistId: PlaylistId];
}>();

const { Item, Separator, Sub, SubTrigger, SubContent } = useTrackMenuComponents();

// Список плейлистов не нужен, пока сабменю закрыто: запрос стартует при первом
// открытии, а не при каждом показе меню, и дальше живёт в кэше.
const hasOpenedSub = shallowRef(false);

function onSubOpenChange(open: boolean) {
  if (open) hasOpenedSub.value = true;
}

const { playlists, isLoading, handleCreatePlaylist } = usePlaylistMenu({
  enabled: hasOpenedSub,
});

const searchQuery = ref("");

const filteredPlaylists = computed(() => {
  if (!searchQuery.value.trim()) return playlists.value;
  const query = searchQuery.value.toLowerCase().trim();
  return playlists.value.filter(p => p.name.toLowerCase().includes(query));
});
</script>

<template>
  <component
    :is="Sub"
    @update:open="onSubOpenChange"
  >
    <component :is="SubTrigger">
      <IconPlaylistAdd class=" size-5.5" />
      {{ $t('track.contextMenu.addToPlaylist') }}
    </component>

    <component
      :is="SubContent"
      class="w-56 "
    >
      <div class="p-0.5">
        <InputGroup class="dark:bg-background! bg-muted!   h-8">
          <InputGroupInput
            v-model="searchQuery"
            :placeholder="$t('track.contextMenu.searchPlaylist')"
            @keydown.stop
          />
          <InputGroupAddon>
            <IconSearch class="size-4" />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <component :is="Separator" />

      <component
        :is="Item"
        @click="handleCreatePlaylist"
      >
        <IconPlus class="size-5.5" />
        {{ $t('track.contextMenu.createPlaylist') }}
      </component>

      <template v-if="isLoading">
        <component :is="Separator" />
        <div class="flex items-center justify-center py-3">
          <IconLoader2 class="size-4 animate-spin text-muted-foreground" />
        </div>
      </template>

      <template v-else-if="filteredPlaylists.length">
        <component :is="Separator" />
        <Scrollable class=" h-24!">
          <component
            :is="Item"
            v-for="playlist in filteredPlaylists"
            :key="playlist.id"
            @click="emit('add', playlist.id)"
          >
            <IconPlaylist class="size-5.5" />
            <span class="truncate">{{ playlist.name }}</span>
          </component>
        </Scrollable>
      </template>

      <template v-else-if="searchQuery && playlists.length">
        <component :is="Separator" />
        <div class="p-3 text-center text-sm text-muted-foreground">
          {{ $t('track.contextMenu.noPlaylistsFound') }}
        </div>
      </template>

      <template v-else-if="!playlists.length">
        <component :is="Separator" />
        <div class="p-3 text-center text-sm text-muted-foreground">
          {{ $t('track.contextMenu.noPlaylistsYet') }}
        </div>
      </template>
    </component>
  </component>
</template>
