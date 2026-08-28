<template>
  <div
    class="shrink-0 flex items-center pb-3 border-b dark:border-background border-border"
    :class="compact ? 'justify-center px-2' : 'gap-2 px-4'"
  >
    <Button
      variant="ghost"
      size="icon-lg"
      class="rounded-full"

      @click="emit('close')"
    >
      <IconArrowLeft class="size-6" />
    </Button>

    <div
      v-if="!compact"
      class="min-w-0 flex-1"
    >
      <EditableValue
        :model-value="folder.name"
        type="text"
        :max-length="FOLDER_NAME_MAX_LENGTH"
        :validate="isValidFolderName"
        root-class="max-w-full"
        display-class="text-lg font-bold truncate min-w-0"
        input-class="text-lg font-bold"
        @change="(name) => emit('rename', name as string)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { EditableValue } from "@/components/ui/editable";
import type { SidebarFolderEntity } from "@/db/entities";
import { FOLDER_NAME_MAX_LENGTH, validateFolderName } from "@/modules/library/lib/folderName";

const isValidFolderName = (name: string) => validateFolderName(name) === null;
import IconArrowLeft from "~icons/tabler/arrow-left";

defineProps<{
  folder: SidebarFolderEntity;
  compact?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  rename: [name: string];
}>();
</script>
