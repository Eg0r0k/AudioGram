<template>
  <PlayItems
    @play-next="actions.playNext"
    @add-to-queue="actions.addToQueue"
  />

  <component :is="Separator" />

  <component
    :is="Item"
    @click="downloadYt"
  >
    <IconDownload class="size-5.5" />
    {{ $t("youtube.download") }}
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PlayItems from "../items/PlayItems.vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import type { ContextActions } from "../type";
import type { PlayerTrack } from "@/modules/player/types";
import { useYoutube } from "@/modules/youtube/composables/useYoutube";
import { ytPlayableFromEphemeral } from "@/modules/youtube/lib/playable";
import IconDownload from "~icons/tabler/download";

const props = defineProps<{
  /** Ephemeral ytstream track built from the row's YtPlayable at open time. */
  track: PlayerTrack;
  actions: ContextActions;
}>();

const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track));

const { download } = useYoutube();

function downloadYt() {
  if (ytPlayable.value) void download(ytPlayable.value);
}

const { Separator, Item } = useTrackMenuComponents();
</script>
