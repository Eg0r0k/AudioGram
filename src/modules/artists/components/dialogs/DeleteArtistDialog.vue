<template>
  <Dialog
    :open="open"
    @update:open="$emit('update:open', $event)"
  >
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t("dialogs.deleteArtist.title") }}</DialogTitle>
        <DialogDescription>
          {{ $t("dialogs.deleteArtist.description", { name: artist?.name }) }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-4 space-y-2 text-sm text-muted-foreground">
        <p>{{ $t("dialogs.deleteArtist.willDelete") }}:</p>
        <ul class="list-disc list-inside space-y-1">
          <li>{{ albumCount }} {{ $t("common.albums", albumCount) }}</li>
          <li>{{ trackCount }} {{ $t("common.tracks", trackCount) }}</li>
        </ul>
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <Button
          variant="outline"
          :disabled="isDeleting"
          @click="$emit('update:open', false)"
        >
          {{ $t("common.cancel") }}
        </Button>
        <Button
          variant="destructive"
          :disabled="isDeleting"
          @click="handleDelete"
        >
          <IconLoader2
            v-if="isDeleting"
            class="size-4 animate-spin"
          />
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
import type { ArtistEntity } from "@/db/entities";
import IconLoader2 from "~icons/tabler/loader-2";

defineProps<{
  open: boolean;
  artist: ArtistEntity | null;
  albumCount: number;
  trackCount: number;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  "confirm": [];
}>();

const isDeleting = ref(false);

function handleDelete() {
  isDeleting.value = true;
  emit("confirm");
}
</script>
