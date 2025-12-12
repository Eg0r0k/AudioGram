<template>
  <ContextMenuContent class="w-60">
    <PlayItems
      @play="actions.play"
      @play-next="actions.playNext"
      @add-to-queue="actions.addToQueue"
    />

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
import LikeItem from "../items/LikeItem.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import NavigationItems from "../items/NavigationItems.vue";
import type { ContextActions } from "../types";
import type { PlaylistId } from "@/types/ids";
import { PlaylistId as createPlaylistId } from "@/types/ids";
import type { Track } from "@/types/track/track";

defineProps<{
  track: Track;
  actions: ContextActions;
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
