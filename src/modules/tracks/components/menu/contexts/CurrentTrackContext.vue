<template>
  <ShowLyricsItem @show="actions.showLyrics" />

  <!-- Library-only items: an ephemeral track (YouTube stream, radio) has no
       DB identity, so liking, playlists, download and navigation would all
       act on undefined ids. -->
  <template v-if="libTrack">
    <component :is="Separator" />

    <LikeItem
      :is-liked="libTrack.isLiked"
      @toggle="actions.toggleLike"
    />

    <DownloadItem @download="actions.download" />

    <LyricsItem
      :has-lyrics="trackHasLyrics(libTrack)"
      @attach="actions.attachLyrics"
    />

    <AddToPlaylistSub @add="actions.addToPlaylist" />

    <component :is="Separator" />

    <NavigationItems
      :artist-ids="libTrack.artistIds"
      :album-name="libTrack.albumName"
      @go-to-artist="actions.goToArtist"
      @go-to-album="actions.goToAlbum"
    />
    <DetailsItem @show="actions.showDetails" />
  </template>

  <!-- Ephemeral YouTube stream: queue ops act on the player track; download
       resolves the video id back from the stream URL. -->
  <template v-else-if="ytPlayable">
    <component :is="Separator" />

    <PlayItems
      @play-next="actions.playNext"
      @add-to-queue="actions.addToQueue"
    />

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
import NavigationItems from "../items/NavigationItems.vue";
import AddToPlaylistSub from "../items/AddToPlaylistSub.vue";
import DetailsItem from "../items/DetailsItem.vue";
import LikeItem from "../items/LikeItem.vue";
import LyricsItem from "../items/LyricsItem.vue";
import PlayItems from "../items/PlayItems.vue";
import ShowLyricsItem from "../items/ShowLyricsItem.vue";
import DownloadItem from "../items/DownloadItem.vue";
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import { isLibraryTrack, type PlayerTrack } from "@/modules/player/types";
import { useYoutube } from "@/modules/youtube/composables/useYoutube";
import { ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import IconDownload from "~icons/tabler/download";

const props = defineProps<{
  track: PlayerTrack;
  actions: ContextActions;
}>();

const libTrack = computed(() => (isLibraryTrack(props.track) ? props.track : null));
const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track));

const { download } = useYoutube();

function downloadYt() {
  if (ytPlayable.value) void download(ytPlayable.value);
}

const { Separator, Item } = useTrackMenuComponents();
</script>
