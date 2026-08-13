<template>
  <DefaultContext
    :track="track"
    :actions="actions"
    :caps="caps"
  />
</template>

<script setup lang="ts">
import type { Track } from "@/modules/player/types";
import type { ContextActions } from "../type";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import DefaultContext from "./DefaultContext.vue";

defineProps<{
  track: Track;
  actions: ContextActions;
  caps?: TrackMenuCaps | null;
}>();
</script>
