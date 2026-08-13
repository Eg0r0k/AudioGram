<template>
  <!-- M4: только ND — YT переезжает на общий механизм в M5. -->
  <template v-if="caps && caps.source === 'nd'">
    <component
      :is="Item"
      v-if="activeJob"
      @click="emit('cancelDownload')"
    >
      <IconLoader class="size-5.5 animate-spin" />
      {{ $t("track.contextMenu.cancelDownload") }}{{ progressSuffix }}
    </component>

    <component
      :is="Item"
      v-else-if="caps.hasOfflineCopy"
      @click="emit('removeOfflineCopy')"
    >
      <IconCloudOff class="size-5.5" />
      {{ $t("track.contextMenu.removeDownload") }}
    </component>

    <component
      :is="Item"
      v-else-if="caps.canOffline"
      @click="emit('download')"
    >
      <IconDownload class="size-5.5" />
      {{ $t("track.contextMenu.download") }}
    </component>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import IconDownload from "~icons/tabler/download";
import IconCloudOff from "~icons/tabler/cloud-off";
import IconLoader from "~icons/tabler/loader-2";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import type { TrackMenuCaps } from "@/modules/tracks/composables/useTrackMenuCaps";
import type { TrackId } from "@/types/ids";
import { useTrackMenuComponents } from "../useTrackMenuComponents";

defineOptions({
  inheritAttrs: false,
});

const props = defineProps<{
  /** Absent caps (shell not yet caps-aware) renders nothing — safe default. */
  caps?: TrackMenuCaps | null;
  trackId?: string | null;
}>();

const emit = defineEmits<{
  download: [];
  cancelDownload: [];
  removeOfflineCopy: [];
}>();

const { Item } = useTrackMenuComponents();
const downloadsStore = useDownloadsStore();

const activeJob = computed(() =>
  props.trackId ? downloadsStore.byTrackId[props.trackId as TrackId] : undefined,
);

const progressSuffix = computed(() => {
  const job = activeJob.value;
  if (!job || job.status !== "running" || !job.total) return "";
  return ` · ${Math.min(100, Math.round((job.downloaded / job.total) * 100))}%`;
});
</script>
