<template>
  <div class="shrink-0 flex items-center gap-2 px-4 pb-3 border-b dark:border-background border-border">
    <Button
      variant="ghost"
      size="icon-lg"
      class="rounded-full"

      @click="emit('close')"
    >
      <IconArrowLeft class="size-6" />
    </Button>

    <div class="min-w-0 flex-1">
      <EditableValue
        :model-value="folder.name"
        type="text"
        root-class="block"
        display-class="truncate text-lg font-bold truncate"
        input-class="text-lg  font-bold w-full truncate min-w-0"
        @change="(name) => emit('rename', name as string)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { EditableValue } from "@/components/ui/editable";
import type { SidebarFolderEntity } from "@/db/entities";
import IconArrowLeft from "~icons/tabler/arrow-left";

defineProps<{
  folder: SidebarFolderEntity;
}>();

const emit = defineEmits<{
  close: [];
  manage: [folderId: string];
  rename: [name: string];
}>();
</script>
