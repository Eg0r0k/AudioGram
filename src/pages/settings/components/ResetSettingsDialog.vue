<template>
  <Dialog
    :open="open"
    @update:open="value => emit('update:open', value)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("settings.index.resetAllDialogTitle") }}</DialogTitle>
        <DialogDescription>
          {{ $t("settings.index.resetAllDialogDesc") }}
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
          :disabled="countdown > 0"
          @click="resolve(true)"
        >
          {{ countdown > 0
            ? $t("settings.index.resetAllConfirmCountdown", { seconds: countdown })
            : $t("settings.index.resetAllConfirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
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
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
}>();

const { resolve, dismiss } = useSummonedDialog<boolean>();

// The instance is summoned fresh per confirmation, so the countdown simply
// starts at mount — same delayed-confirm pattern as the storage clear dialog.
const COUNTDOWN_SECONDS = 3;
const countdown = ref(COUNTDOWN_SECONDS);
const timer = setInterval(() => {
  countdown.value -= 1;
  if (countdown.value <= 0) clearInterval(timer);
}, 1000);

onBeforeUnmount(() => clearInterval(timer));
</script>
