<template>
  <ContextMenuContent class="w-60">
    <PlayItems
      :on-play="actions.play"
      :on-play-next="actions.playNext"
      :on-add-to-queue="actions.addToQueue"
    />
    <ContextMenuSeparator />
    <LikeItem
      :is-liked="track.isLiked"
      :on-toggle="actions.toggleLike"
    />
    <AddToPlaylistSub
      :playlists="[]"
      :on-add="actions.addToPlaylist"
      :on-create="() => {}"
    />
    <NavigationItems
      :artist-name="track.artist"
      :album-name="track.albumName"
      :on-go-to-artist="actions.goToArtist"
      :on-go-to-album="actions.goToAlbum"
    />

    <template v-if="isOwner">
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        @click="actions.removeFromPlaylist"
      >
        <Icon icon="tabler:trash" />
        Удалить из плейлиста
      </ContextMenuItem>
    </template>
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

defineProps<{
  track: Track;
  actions: ContextActions;
  playlistId: string;
  isOwner: boolean;
}>();

</script>
