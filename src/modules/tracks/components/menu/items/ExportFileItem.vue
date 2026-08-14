<template>
  <!-- Needs a real file: the track's own or its offline copy. A live catalog
       row has neither, and the export would silently do nothing. -->
  <component
    :is="Item"
    v-if="canExport"
    @click="emit('export')"
  >
    <IconDownload class="size-5.5" />
    {{ $t("track.contextMenu.exportFile") }}
  </component>
</template>

<script setup lang="ts">
import { computed } from "vue";
import IconDownload from "~icons/tabler/download";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import { useTrackMenuComponents } from "../useTrackMenuComponents";

const props = defineProps<{
  /** Absent on local-only call sites, which always have their file. */
  caps?: TrackMenuCaps | null;
}>();

const canExport = computed(() => props.caps?.canExportFile ?? true);

const { Item } = useTrackMenuComponents();

const emit = defineEmits<{
  export: [];
}>();
</script>
