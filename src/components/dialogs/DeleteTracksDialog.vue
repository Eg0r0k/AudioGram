<template>
  <Dialog
    :open="open"
    @update:open="value => emit('update:open', value)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("library.selection.deleteDialog.title", count) }}</DialogTitle>
        <DialogDescription>
          {{ $t("library.selection.deleteDialog.description", count) }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          variant="ghost-primary"
          @click="dismiss"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive-link"
          @click="resolve(true)"
        >
          {{ $t("common.delete") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSummonedDialog } from "@/components/dialogs/summon";

defineProps<{
  count: number;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
}>();

const { resolve, dismiss } = useSummonedDialog<boolean>();
</script>
