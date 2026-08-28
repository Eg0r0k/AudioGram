<template>
  <Dialog
    :open="open"
    @update:open="value => emit('update:open', value)"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t("library.folder.moveToFolder") }}</DialogTitle>
        <DialogDescription>
          {{ item.title }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-1">
        <Button
          v-for="folder in folders"
          :key="folder.id"
          type="button"
          variant="ghost"
          class="justify-start"
          @click="resolve(folder.id)"
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { useSummonedDialog } from "@/components/dialogs/summon";
import type { SidebarFolderEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import IconFolder from "~icons/tabler/folder";
import IconFolderOff from "~icons/tabler/folder-off";

// Summoned via summonDialog<string>(MoveToFolderDialog, { item, folders }):
// resolves with the picked folder id, or undefined when dismissed.
defineProps<{
  open: boolean;
  item: LibraryItem;
  folders: SidebarFolderEntity[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
}>();

const { resolve } = useSummonedDialog<string>();
</script>
