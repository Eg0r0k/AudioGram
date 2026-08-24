<!-- eslint-disable vuejs-accessibility/label-has-for -->
<template>
  <Dialog
    :open="open"
    @update:open="value => emit('update:open', value)"
  >
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>
          {{ dialogDescription }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex items-start gap-4 overflow-hidden">
        <div
          class="size-16 shrink-0 overflow-hidden bg-muted"
          :class="coverShapeClass"
        >
          <img
            v-if="coverUrl"
            :src="coverUrl"
            :alt="data.name"
            class="size-full object-cover"
          >
          <div
            v-else
            class="flex size-full items-center justify-center"
          >
            <component
              :is="fallbackIcon"
              class="size-6 text-muted-foreground"
            />
          </div>
        </div>

        <div class="min-w-0 flex-1 overflow-hidden">
          <p class="w-full truncate font-medium">
            {{ data.name }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ $t("common.trackCount", data.trackCount) }}
          </p>
        </div>
      </div>

      <Label
        v-if="canDeleteTracks"
        for="delete-confirm-tracks"
        class="cursor-pointer font-normal text-muted-foreground"
      >
        <Checkbox
          id="delete-confirm-tracks"
          v-model="deleteTracks"
        />
        {{ $t("dialogs.deleteConfirm.deleteTracks") }}
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
          @click="resolve({ deleteTracks })"
        >
          {{ $t("common.delete") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
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
import type { DeleteConfirmData, DeleteConfirmResult } from "@/components/dialogs/deleteConfirm";
import { useEntityCover } from "@/modules/covers/composables/useEntityCover";

import IconPlaylist from "~icons/tabler/playlist";
import IconDisc from "~icons/tabler/disc";
import IconUser from "~icons/tabler/user";

const props = defineProps<{
  data: DeleteConfirmData;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [boolean];
}>();

const { t } = useI18n();
const { resolve, dismiss } = useSummonedDialog<DeleteConfirmResult>();

const deleteTracks = ref(props.data.defaultDeleteTracks === true);

const canDeleteTracks = computed(() => props.data.trackCount > 0);

const { url: coverUrl } = useEntityCover(
  () => props.data.type,
  () => props.data.id,
);

const dialogTitle = computed(() => {
  switch (props.data.type) {
    case "album":
      return t("library.contextMenu.deleteAlbum");
    case "playlist":
      return t("library.contextMenu.deletePlaylist");
    case "artist":
      return t("dialogs.deleteArtist.title");
    default:
      return t("common.delete");
  }
});

const dialogDescription = computed(() =>
  t("dialogs.deleteConfirm.description", { name: props.data.name }),
);

const coverShapeClass = computed(() =>
  props.data.type === "artist" ? "rounded-full" : "rounded-lg",
);

const fallbackIcon = computed(() => {
  switch (props.data.type) {
    case "album":
      return IconDisc;
    case "artist":
      return IconUser;
    case "playlist":
    default:
      return IconPlaylist;
  }
});
</script>
