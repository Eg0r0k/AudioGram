<template>
  <PlayItems
    @play="actions.play"
    @play-next="actions.playNext"
    @add-to-queue="actions.addToQueue"
  />

  <component :is="Separator" />

  <LikeItem
    :is-liked="track.isLiked"
    @toggle="actions.toggleLike"
  />

  <AddToPlaylistSub @add="actions.addToPlaylist" />

  <OfflineItem
    :caps="caps"
    :track-id="track.id"
    @download="actions.downloadOffline"
    @cancel-download="actions.cancelOfflineDownload"
    @remove-offline-copy="actions.removeOfflineCopy"
  />

  <MoreSub
    :caps="caps"
    :has-lyrics="trackHasLyrics(track)"
    @export="actions.exportFile"
    @attach-lyrics="actions.attachLyrics"
    @add-to-library="actions.addToLibrary"
    @remove-from-library="actions.removeFromLibrary"
    @open-external="actions.openExternal"
  />

  <component :is="Separator" />

  <NavigationItems
    :artist-ids="track.artistIds"
    :album-name="track.albumName"
    @go-to-artist="actions.goToArtist"
    @go-to-album="actions.goToAlbum"
  />
  <DetailsItem @show="actions.showDetails" />
</template>

<script setup lang="ts">
import PlayItems from "../items/PlayItems.vue";
import NavigationItems from "../items/NavigationItems.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import DetailsItem from "../items/DetailsItem.vue";
import LikeItem from "../items/LikeItem.vue";
import MoreSub from "../items/MoreSub.vue";
import OfflineItem from "../items/OfflineItem.vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import type { Track } from "@/modules/player/types";

defineProps<{
  track: Track;
  actions: ContextActions;
  caps?: TrackMenuCaps | null;
}>();

const { Separator } = useTrackMenuComponents();
</script>
