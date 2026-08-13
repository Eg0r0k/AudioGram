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

  <DetailsItem @show="actions.showDetails" />

  <ExportFileItem @export="actions.exportFile" />

  <LyricsItem
    :has-lyrics="trackHasLyrics(track)"
    @attach="actions.attachLyrics"
  />

  <AddToPlaylistSub @add="actions.addToPlaylist" />

  <SourceItems
    :caps="caps"
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

  <component :is="Separator" />

  <component
    :is="Item"
    variant="destructive"
    @click="actions.removeFromHistory?.()"
  >
    <IconTrash class="size-5.5" />
    {{ $t('track.contextMenu.removeFromHistory') }}
  </component>
</template>

<script setup lang="ts">
import PlayItems from "../items/PlayItems.vue";
import LikeItem from "../items/LikeItem.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import DetailsItem from "../items/DetailsItem.vue";
import NavigationItems from "../items/NavigationItems.vue";
import LyricsItem from "../items/LyricsItem.vue";
import ExportFileItem from "../items/ExportFileItem.vue";
import SourceItems from "../items/SourceItems.vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import type { Track } from "@/modules/player/types";
import IconTrash from "~icons/tabler/trash";

defineProps<{
  track: Track;
  actions: ContextActions;
  caps?: TrackMenuCaps | null;
}>();

const { Separator, Item } = useTrackMenuComponents();
</script>
