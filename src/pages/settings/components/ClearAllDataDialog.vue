<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ $t("settings.storage.clearAllDialogTitle") }}</DialogTitle>
        <DialogDescription>
          {{ $t("settings.storage.clearAllDialogDesc") }}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button
          variant="ghost-primary"
          @click="emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive-link"
          :disabled="countdown > 0 || pending"
          @click="emit('confirm')"
        >
          {{ countdown > 0
            ? $t("settings.storage.clearAllConfirmCountdown", { seconds: countdown })
            : $t("settings.storage.clearAllConfirm") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  open: boolean;
  stats: {
    tracksCount: number;
    albumsCount: number;
    artistsCount: number;
    totalUsed: string;
  };
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  "confirm": [];
}>();

const COUNTDOWN_SECONDS = 3;
const countdown = ref(COUNTDOWN_SECONDS);
let timer: ReturnType<typeof setInterval> | null = null;

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(() => props.open, (open) => {
  stopTimer();
  if (!open) return;
  countdown.value = COUNTDOWN_SECONDS;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) stopTimer();
  }, 1000);
}, { immediate: true });

onBeforeUnmount(stopTimer);
</script>
