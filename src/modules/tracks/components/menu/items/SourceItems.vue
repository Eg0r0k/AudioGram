<template>
  <template v-if="caps && caps.source !== 'local'">
    <component
      :is="Item"
      v-if="!caps.isInLibrary"
      @click="emit('addToLibrary')"
    >
      <IconLibraryPlus class="size-5.5" />
      {{ $t("track.contextMenu.addToLibrary") }}
    </component>

    <component
      :is="Item"
      v-if="caps.isInLibrary"
      @click="emit('removeFromLibrary')"
    >
      <IconLibraryMinus class="size-5.5" />
      {{ $t("track.contextMenu.removeFromLibrary") }}
    </component>

    <component
      :is="Item"
      v-if="caps.canOpenExternal"
      @click="emit('openExternal')"
    >
      <IconExternalLink class="size-5.5" />
      {{ $t("track.contextMenu.openExternal") }}
    </component>
  </template>
</template>

<script setup lang="ts">
import IconLibraryPlus from "~icons/tabler/library-plus";
import IconLibraryMinus from "~icons/tabler/library-minus";
import IconExternalLink from "~icons/tabler/external-link";
import { useTrackMenuComponents } from "../useTrackMenuComponents";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";

defineOptions({
  inheritAttrs: false,
});

defineProps<{
  /** Absent caps (shell not yet caps-aware) renders nothing — safe default. */
  caps?: TrackMenuCaps | null;
}>();

const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  addToLibrary: [];
  removeFromLibrary: [];
  openExternal: [];
}>();
</script>
