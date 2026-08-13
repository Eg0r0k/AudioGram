<template>
  <component
    :is="Item"
    v-if="actions.canDownloadOffline?.value"
    @click="actions.downloadOffline?.()"
  >
    <IconDownload class="size-5.5" />
    {{ $t('media.contextMenu.downloadAlbum') }}
  </component>

  <component
    :is="Item"
    @click="actions.edit"
  >
    <IconPencil
      class=" size-5.5"
    />
    {{ $t('common.edit') }}
  </component>

  <component
    :is="Item"
    variant="destructive"
    @click="actions.delete"
  >
    <IconTrash
      class=" size-5.5"
    />
    {{ $t('common.delete') }}
  </component>
</template>

<script setup lang="ts">
import type { MediaActions } from "../types";
import IconDownload from "~icons/tabler/download";
import IconPencil from "~icons/tabler/pencil";
import IconTrash from "~icons/tabler/trash";
import { useMenuComponents } from "@/modules/media-hero/composables/useMenuComponents";

defineProps<{
  actions: MediaActions;
}>();

const { Item } = useMenuComponents();
</script>
