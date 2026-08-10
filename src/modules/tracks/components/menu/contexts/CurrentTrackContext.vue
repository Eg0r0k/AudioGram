<template>
  <ShowLyricsItem @show="actions.showLyrics" />

  <!-- Library-only items: an ephemeral track (YouTube stream, radio) has no
       DB identity, so liking, playlists, download and navigation would all
       act on undefined ids. -->
  <template v-if="isLibrary">
    <component :is="Separator" />

    <LikeItem
      :is-liked="track.isLiked"
      @toggle="actions.toggleLike"
    />

    <DownloadItem @download="actions.download" />

    <LyricsItem
      :has-lyrics="trackHasLyrics(track)"
      @attach="actions.attachLyrics"
    />

    <AddToPlaylistSub @add="actions.addToPlaylist" />

    <component :is="Separator" />

    <NavigationItems
      :artist-ids="track.artistIds"
      :album-name="track.albumName"
      @go-to-artist="actions.goToArtist"
      @go-to-album="actions.goToAlbum"
    />
    <DetailsItem @show="actions.showDetails" />
  </template>
</template>

<script setup lang="ts">
import NavigationItems from "../items/NavigationItems.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import DetailsItem from "../items/DetailsItem.vue";
import LikeItem from "../items/LikeItem.vue";
import LyricsItem from "../items/LyricsItem.vue";
import ShowLyricsItem from "../items/ShowLyricsItem.vue";
import DownloadItem from "../items/DownloadItem.vue";
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import { isLibraryTrack, type Track } from "@/modules/player/types";

const props = defineProps<{
  track: Track;
  actions: ContextActions;
}>();

const isLibrary = computed(() => isLibraryTrack(props.track));

const { Separator } = useTrackMenuComponents();
</script>
