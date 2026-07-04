<template>
  <ContextMenuItem
    v-if="canTogglePin"
    @select="props.togglePin"
  >
    <IconPinFilled
      v-if="item.isPinned"
      class="size-5 text-primary"
    />
    <IconPin
      v-else
      class="size-5"
    />
    {{ item.isPinned ? pinOffLabel : pinOnLabel }}
  </ContextMenuItem>

  <ContextMenuItem @select="props.addToQueue">
    <IconList class="size-5" />
    {{ $t("track.contextMenu.addToQueue") }}
  </ContextMenuItem>

  <ContextMenuItem @select="props.createPlaylist">
    <IconPlus class="size-5" />
    {{ $t("track.contextMenu.createPlaylist") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="props.moveToFolder"
    @select="props.moveToFolder"
  >
    <IconFolder class="size-5" />
    {{ $t("library.folder.moveToFolder") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="props.removeFromFolder"
    @select="props.removeFromFolder"
  >
    <IconFolderMinus class="size-5" />
    {{ $t("library.folder.removeFromFolder") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="props.deleteItem"
    class="text-destructive focus:text-destructive"
    @select="props.deleteItem"
  >
    <IconTrash class="size-5" />
    {{ deleteLabel }}
  </ContextMenuItem>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ContextMenuItem } from "@/components/ui/context-menu";
import type { LibraryItem } from "@/modules/library/types";
import IconList from "~icons/tabler/list";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconPin from "~icons/tabler/pin";
import IconPlus from "~icons/tabler/plus";
import IconTrash from "~icons/tabler/trash";
import IconFolder from "~icons/tabler/folder";
import IconFolderMinus from "~icons/tabler/folder-minus";

const props = defineProps<{
  item: LibraryItem;
  togglePin?: () => void;
  addToQueue: () => void;
  createPlaylist: () => void;
  moveToFolder?: () => void;
  removeFromFolder?: () => void;
  deleteItem?: () => void;
}>();

const { t } = useI18n();

const canTogglePin = computed(() => props.item.type !== "liked" && props.item.type !== "allMedia" && !!props.togglePin);

const pinOnLabel = computed(() => {
  switch (props.item.type) {
    case "album":
      return t("library.contextMenu.pinAlbum");
    case "playlist":
      return t("library.contextMenu.pinPlaylist");
    default:
      return t("library.contextMenu.pinItem");
  }
});

const pinOffLabel = computed(() => {
  switch (props.item.type) {
    case "album":
      return t("library.contextMenu.unpinAlbum");
    case "playlist":
      return t("library.contextMenu.unpinPlaylist");
    default:
      return t("library.contextMenu.unpinItem");
  }
});

const deleteLabel = computed(() => {
  switch (props.item.type) {
    case "album":
      return t("library.contextMenu.deleteAlbum");
    case "playlist":
      return t("library.contextMenu.deletePlaylist");
    default:
      return t("library.contextMenu.deleteItem");
  }
});
</script>
