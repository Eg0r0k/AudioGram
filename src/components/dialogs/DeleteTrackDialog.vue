<!-- eslint-disable vuejs-accessibility/label-has-for -->
<template>
  <Dialog
    :open="open"
    @update:open="value => emit('update:open', value)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("track.deleteDialog.title") }}</DialogTitle>
        <DialogDescription>
          {{ $t("track.deleteDialog.description", { title: trackTitle }) }}
        </DialogDescription>
      </DialogHeader>

      <Label
        for="delete-track-dont-ask"
        class="cursor-pointer font-normal text-muted-foreground"
      >
        <Checkbox
          id="delete-track-dont-ask"
          v-model="dontAskAgain"
        />
        {{ $t("track.deleteDialog.dontAskAgain") }}
      </Label>

      <DialogFooter>
        <Button
          variant="ghost-primary"
          @click="dismiss"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive-link"
          @click="resolve({ dontAskAgain })"
        >
          {{ $t("common.delete") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSummonedDialog } from "@/components/dialogs/summon";

export interface DeleteTrackConfirmation {
  dontAskAgain: boolean;
}

defineProps<{
  trackTitle: string;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
}>();

const { resolve, dismiss } = useSummonedDialog<DeleteTrackConfirmation>();

const dontAskAgain = ref(false);
</script>
