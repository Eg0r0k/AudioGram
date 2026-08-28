<template>
  <ContextMenuItem @select="props.openFolder">
    <IconFolderOpen class="size-5" />
    {{ $t("library.folder.open") }}
  </ContextMenuItem>

  <ContextMenuItem @select="props.addToFolder">
    <IconFolderPlus class="size-5" />
    {{ $t("library.folder.addItems") }}
  </ContextMenuItem>

  <ContextMenuItem @select="props.renameFolder">
    <IconPencil class="size-5" />
    {{ $t("library.folder.rename") }}
  </ContextMenuItem>

  <ContextMenuItem
    class="text-destructive focus:text-destructive"
    @select="props.deleteFolder"
  >
    <IconTrash class="size-5" />
    {{ $t("library.folder.delete") }}
  </ContextMenuItem>
</template>

<script setup lang="ts">
import { ContextMenuItem } from "@/components/ui/context-menu";
import IconFolderOpen from "~icons/tabler/folder-open";
import IconFolderPlus from "~icons/tabler/folder-plus";
import IconPencil from "~icons/tabler/pencil";
import IconTrash from "~icons/tabler/trash";

const props = defineProps<{
  openFolder: () => void;
  addToFolder: () => void;
  renameFolder: () => void;
  deleteFolder: () => void;
}>();
</script>
