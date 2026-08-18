<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t("library.folder.moveToFolder") }}</DialogTitle>
        <DialogDescription>
          {{ item?.title }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-1">
        <Button
          v-for="folder in folders"
          :key="folder.id"
          type="button"
          variant="ghost"
          class="justify-start"
          @click="emit('move', folder.id)"
        >
          <IconFolder class="size-5" />
          {{ folder.name }}
        </Button>

        <Empty
          v-if="folders.length === 0"
          class="p-4 py-8 md:p-4 md:py-8"
        >
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              class="rounded-full text-muted-foreground"
            >
              <IconFolderOff class="size-5" />
            </EmptyMedia>
            <EmptyDescription>{{ $t("library.folder.noFolders") }}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import type { SidebarFolderEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import IconFolder from "~icons/tabler/folder";
import IconFolderOff from "~icons/tabler/folder-off";

const props = defineProps<{
  open: boolean;
  folders: SidebarFolderEntity[];
  item: LibraryItem | null;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "move": [folderId: string];
}>();

const isOpen = computed({
  get: () => props.open,
  set: value => emit("update:open", value),
});
</script>
