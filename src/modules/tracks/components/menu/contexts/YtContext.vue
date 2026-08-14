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
import { downloadDtoWithFeedback } from "@/modules/downloads/downloadFeedback";
import { ytPlayableFromEphemeral, ytPlayableToDto } from "@/modules/youtube/lib/playable";
import IconDownload from "~icons/tabler/download";

const props = defineProps<{
  /** Ephemeral YT stream track built from the row's YtPlayable at open time. */
  track: PlayerTrack;
  actions: ContextActions;
}>();

const ytPlayable = computed(() => ytPlayableFromEphemeral(props.track));

// M5: YT downloads go through the shared manager (pin → job → offline copy).
async function downloadYt() {
  if (!ytPlayable.value) return;
  await downloadDtoWithFeedback(ytPlayableToDto(ytPlayable.value));
}

const { Separator, Item } = useTrackMenuComponents();
</script>
