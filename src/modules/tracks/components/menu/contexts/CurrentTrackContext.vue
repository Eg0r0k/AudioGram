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

    <ExportFileItem @export="actions.exportFile" />

    <LyricsItem
      :has-lyrics="trackHasLyrics(libTrack)"
      @attach="actions.attachLyrics"
    />

    <AddToPlaylistSub @add="actions.addToPlaylist" />

    <OfflineItem
      :caps="caps"
      :track-id="libTrack.id"
      @download="actions.downloadOffline"
      @cancel-download="actions.cancelOfflineDownload"
      @remove-offline-copy="actions.removeOfflineCopy"
    />

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

  <!-- "Open with" ephemeral file (desktop): the CTA into the import
       pipeline — importing is what turns it into a library track. -->
  <template v-else-if="importPath">
    <component :is="Separator" />

    <PlayItems
      @play-next="actions.playNext"
      @add-to-queue="actions.addToQueue"
    />

    <component
      :is="Item"
      @click="importCurrent"
    >
      <IconFileImport class="size-5.5" />
      {{ $t("import.toLibrary") }}
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
import ExportFileItem from "../items/ExportFileItem.vue";
import OfflineItem from "../items/OfflineItem.vue";
import SourceItems from "../items/SourceItems.vue";
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { ephemeralFilePath, trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import { useImport } from "@/composables/useImport";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { isLibraryTrack, type PlayerTrack } from "@/modules/player/types";
import { useYoutube } from "@/modules/youtube/composables/useYoutube";
import { ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import IconDownload from "~icons/tabler/download";
import IconFileImport from "~icons/tabler/file-import";

const props = defineProps<{
  track: PlayerTrack;
  actions: ContextActions;
  caps?: TrackMenuCaps | null;
}>();

const libTrack = computed(() => (isLibraryTrack(props.track) ? props.track : null));
const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track));

const { download } = useYoutube();

function downloadYt() {
  if (ytPlayable.value) void download(ytPlayable.value);
}

const { importFromPaths } = useImport();
const importPath = computed(() => ephemeralFilePath(props.track));

function importCurrent() {
  if (importPath.value) void importFromPaths([importPath.value]);
}

const { Separator, Item } = useTrackMenuComponents();
</script>
