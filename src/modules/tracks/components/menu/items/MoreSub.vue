<template>
  <component :is="Sub">
    <component :is="SubTrigger">
      <IconDots class="size-5.5" />
      {{ $t("track.contextMenu.more") }}
    </component>

    <component
      :is="SubContent"
      class="w-56"
    >
      <SourceItems
        :caps="caps"
        @add-to-library="emit('addToLibrary')"
        @remove-from-library="emit('removeFromLibrary')"
        @open-external="emit('openExternal')"
      />

      <ExportFileItem
        :caps="caps"
        @export="emit('export')"
      />

      <LyricsItem
        :has-lyrics="hasLyrics"
        @attach="emit('attachLyrics')"
      />
    </component>
  </component>
</template>

<script setup lang="ts">
import IconDots from "~icons/tabler/dots";
import ExportFileItem from "./ExportFileItem.vue";
import LyricsItem from "./LyricsItem.vue";
import SourceItems from "./SourceItems.vue";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";

defineOptions({
  inheritAttrs: false,
});

defineProps<{
  caps?: TrackMenuCaps | null;
  hasLyrics: boolean;
}>();

const { Sub, SubTrigger, SubContent } = useTrackMenuComponents();

const emit = defineEmits<{
  export: [];
  attachLyrics: [];
  addToLibrary: [];
  removeFromLibrary: [];
  openExternal: [];
}>();
</script>
