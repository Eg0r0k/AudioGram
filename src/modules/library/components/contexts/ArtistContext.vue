<template>
  <ContextMenuItem @select="props.onTogglePin">
    <IconPinFilled
      v-if="item.isPinned"
      class="size-5  text-primary"
    />
    <IconPin
      v-else
      class="size-5 "
    />
    {{ item.isPinned ? $t("artist.unpinArtist") : $t("artist.pinArtist") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="props.onMoveToFolder"
    @select="props.onMoveToFolder"
  >
    <IconFolder class="size-5" />
    {{ $t("library.folder.moveToFolder") }}
  </ContextMenuItem>

  <ContextMenuItem
    v-if="props.onRemoveFromFolder"
    @select="props.onRemoveFromFolder"
  >
    <IconFolderMinus class="size-5" />
    {{ $t("library.folder.removeFromFolder") }}
  </ContextMenuItem>

  <ContextMenuItem
    class="text-destructive focus:text-destructive"
    @select="props.onDelete"
  >
    <IconTrash class="size-5 " />
    {{ $t("artist.deleteArtist") }}
  </ContextMenuItem>
</template>
<script setup lang="ts">
import {
  ContextMenuItem,
} from "@/components/ui/context-menu";
import type { LibraryItem } from "@/modules/library/types";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconPin from "~icons/tabler/pin";
import IconTrash from "~icons/tabler/trash";
import IconFolder from "~icons/tabler/folder";
import IconFolderMinus from "~icons/tabler/folder-minus";

const props = defineProps<{
  item: LibraryItem;
  onTogglePin: () => void;
  onMoveToFolder?: () => void;
  onRemoveFromFolder?: () => void;
  onDelete: () => void;
}>();
</script>
