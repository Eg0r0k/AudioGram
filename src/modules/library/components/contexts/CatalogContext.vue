<template>
  <ContextMenuItem @select="props.addToQueue">
    <IconList class="size-5" />
    {{ $t("track.contextMenu.addToQueue") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="canDownload"
    @select="props.download"
  >
    <IconDownload class="size-5" />
    {{ downloadLabel }}
  </ContextMenuItem>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { IS_TAURI } from "@/lib/environment/userAgent";
import type { LibraryItem } from "@/modules/library/types";
import IconList from "~icons/tabler/list";
import IconDownload from "~icons/tabler/download";

//
// Live catalog row (ND browsing): pinning, folders and deletion have no row
// to write to, so the menu carries only what the source itself can do —
// queue the tracks, or pull them down as offline copies.
//

const props = defineProps<{
  item: LibraryItem;
  addToQueue: () => void;
  download: () => void;
}>();

const { t } = useI18n();

/** Offline copies are a native-storage feature. */
const canDownload = computed(() => IS_TAURI);

const downloadLabel = computed(() =>
  props.item.type === "album"
    ? t("media.contextMenu.downloadAlbum")
    : t("media.contextMenu.downloadPlaylist"),
);
</script>
