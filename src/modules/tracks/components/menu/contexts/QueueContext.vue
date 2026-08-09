<template>
  <PlayItems
    @play="actions.play"
    @play-next="actions.playNext"
    @add-to-queue="actions.addToQueue"
  />

  <component :is="Separator" />

  <component
    :is="Item"
    variant="destructive"
    @click="actions.removeFromQueue?.()"
  >
    <IconTrash class="size-5.5" />
    {{ $t('track.contextMenu.removeFromQueue') }}
  </component>

  <!-- Library-only items: an ephemeral track (YouTube stream, radio) has no
       DB identity, so liking, playlists, download and navigation would all
       act on undefined ids. -->
  <template v-if="isLibrary">
    <component :is="Separator" />

    <LikeItem
      :is-liked="track.isLiked"
      @toggle="actions.toggleLike"
    />

    <DetailsItem @show="actions.showDetails" />

    <DownloadItem @download="actions.download" />

    <LyricsItem
      :has-lyrics="!!track.lyricsPath"
      @attach="actions.attachLyrics"
    />

    <AddToPlaylistSub
      :playlists="playlists"
      :is-loading="isLoading"
      @add="actions.addToPlaylist"
      @create="handleCreatePlaylist"
    />

    <component :is="Separator" />

    <NavigationItems
      :artist-ids="track.artistIds"
      :album-name="track.albumName"
      @go-to-artist="actions.goToArtist"
      @go-to-album="actions.goToAlbum"
    />
  </template>
</template>

<script setup lang="ts">
import PlayItems from "../items/PlayItems.vue";
import LikeItem from "../items/LikeItem.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import DetailsItem from "../items/DetailsItem.vue";
import NavigationItems from "../items/NavigationItems.vue";
import LyricsItem from "../items/LyricsItem.vue";
import DownloadItem from "../items/DownloadItem.vue";
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { usePlaylistMenu } from "../composables/usePlaylistMenu";
import type { ContextActions } from "../type";
import { isLibraryTrack, type Track } from "@/modules/player/types";
import IconTrash from "~icons/tabler/trash";

const props = defineProps<{
  track: Track;
  actions: ContextActions;
  queueIndex: number;
  queueLength: number;
}>();

const isLibrary = computed(() => isLibraryTrack(props.track));

const { Separator, Item } = useTrackMenuComponents();
const { playlists, isLoading, handleCreatePlaylist } = usePlaylistMenu();
</script>
