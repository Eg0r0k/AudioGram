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

  <template v-if="libTrack">
    <component :is="Separator" />

    <LikeItem
      :is-liked="libTrack.isLiked"
      @toggle="actions.toggleLike"
    />

    <DetailsItem @show="actions.showDetails" />

    <AddToPlaylistSub @add="actions.addToPlaylist" />

    <OfflineItem
      :caps="caps"
      :track-id="libTrack.id"
      @download="actions.downloadOffline"
      @cancel-download="actions.cancelOfflineDownload"
      @remove-offline-copy="actions.removeOfflineCopy"
    />

    <MoreSub
      :caps="caps"
      :has-lyrics="trackHasLyrics(libTrack)"
      @export="actions.exportFile"
      @attach-lyrics="actions.attachLyrics"
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
import MoreSub from "../items/MoreSub.vue";
import OfflineItem from "../items/OfflineItem.vue";
import { computed } from "vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import { trackHasLyrics } from "@/modules/tracks/lib/trackPredicates";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { isLibraryTrack, type PlayerTrack } from "@/modules/player/types";
import { downloadDtoWithFeedback } from "@/modules/downloads/downloadFeedback";
import { ytDownloadDto, ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
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

// M5: YT downloads go through the shared manager (pin → job → offline copy).
async function downloadYt() {
  if (!ytPlayable.value) return;
  await downloadDtoWithFeedback(ytDownloadDto(props.track, ytPlayable.value));
}

const { Separator, Item } = useTrackMenuComponents();
</script>
