<template>
  <ContextMenuContent class="w-60">
    <PlayItems
      @play="actions.play"
      @play-next="actions.playNext"
      @add-to-queue="actions.addToQueue"
    />

    <ContextMenuSeparator />

    <ContextMenuItem
      :disabled="queueIndex === 0"
      @click="emit('moveUp')"
    >
      <Icon icon="tabler:arrow-up" />
      Переместить выше
    </ContextMenuItem>

    <ContextMenuItem
      :disabled="queueIndex === queueLength - 1"
      @click="emit('moveDown')"
    >
      <Icon icon="tabler:arrow-down" />
      Переместить ниже
    </ContextMenuItem>

    <ContextMenuItem
      variant="destructive"
      @click="actions.removeFromQueue?.()"
    >
      <Icon icon="tabler:trash" />
      Удалить из очереди
    </ContextMenuItem>

    <ContextMenuSeparator />

    <LikeItem
      :is-liked="track.isLiked"
      @toggle="actions.toggleLike"
    />

    <AddToPlaylistSub
      :playlists="playlists"
      @add="actions.addToPlaylist"
      @create="handleCreatePlaylist"
    />

    <ContextMenuSeparator />

    <NavigationItems
      :artist-name="track.artist"
      :album-name="track.albumName"
      @go-to-artist="actions.goToArtist"
      @go-to-album="actions.goToAlbum"
    />
  </ContextMenuContent>
</template>
<script setup lang="ts">
import { ContextMenuContent, ContextMenuSeparator } from "@/components/ui/context-menu";
import PlayItems from "../items/PlayItems.vue";
import { Track } from "@/types/track/track";
import { ContextActions } from "../types";
import LikeItem from "../items/LikeItem.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import NavigationItems from "../items/NavigationItems.vue";
import ContextMenuItem from "@/components/ui/context-menu/ContextMenuItem.vue";
import { Icon } from "@iconify/vue";
import { PlaylistId as createPlaylistId } from "@/types/ids";
import { PlaylistId } from "@/types/ids";

defineProps<{
  track: Track;
  actions: ContextActions;
  queueIndex: number;
  queueLength: number;
}>();

const emit = defineEmits<{
  moveUp: [];
  moveDown: [];
}>();

const playlists: { id: PlaylistId; name: string }[] = [
  { id: createPlaylistId("1"), name: "Избранное" },
  { id: createPlaylistId("2"), name: "Для тренировок" },
  { id: createPlaylistId("3"), name: "Вечерний плейлист" },
];
const handleCreatePlaylist = () => {
  console.log("Create playlist");
};
</script>
