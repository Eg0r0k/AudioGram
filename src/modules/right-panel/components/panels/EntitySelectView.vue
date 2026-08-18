<template>
  <ArtistSelectPanel
    v-if="payload.kind === 'artists'"
    :payload="payload"
  />
  <AlbumSelectPanel
    v-else
    :payload="payload"
  />
</template>

<script setup lang="ts">
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import ArtistSelectPanel from "@/modules/tracks/components/edit/ArtistSelectPanel.vue";
import AlbumSelectPanel from "@/modules/tracks/components/edit/AlbumSelectPanel.vue";

defineProps<{ payload: RightPanelEntitySelectPayload }>();
</script>
