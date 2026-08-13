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
  <template v-if="libTrack">
    <component :is="Separator" />

    <LikeItem
      :is-liked="libTrack.isLiked"
      @toggle="actions.toggleLike"
    />

    <DetailsItem @show="actions.showDetails" />

    <ExportFileItem @export="actions.exportFile" />

    <LyricsItem
      :has-lyrics="trackHasLyrics(libTrack)"
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
      :artist-ids="libTrack.artistIds"
      :album-name="libTrack.albumName"
      @go-to-artist="actions.goToArtist"
      @go-to-album="actions.goToAlbum"
    />
  </template>

  <!-- Ephemeral YouTube stream: allow saving it into the library. -->
  <template v-else-if="ytPlayable">
    <component :is="Separator" />

    <component
      :is="Item"
      @click="downloadYt"
    >
      <IconDownload class="size-5.5" />
      {{ $t("youtube.download") }}
    </component>
  </template>
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
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { isLibraryTrack, type PlayerTrack } from "@/modules/player/types";
import { useYoutube } from "@/modules/youtube/composables/useYoutube";
import { ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import IconDownload from "~icons/tabler/download";
import IconTrash from "~icons/tabler/trash";

const props = defineProps<{
  track: PlayerTrack;
  actions: ContextActions;
  queueIndex: number;
  queueLength: number;
  caps?: TrackMenuCaps | null;
}>();

const libTrack = computed(() => (isLibraryTrack(props.track) ? props.track : null));
const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track));

const { download } = useYoutube();

function downloadYt() {
  if (ytPlayable.value) void download(ytPlayable.value);
}

const { Separator, Item } = useTrackMenuComponents();
</script>
