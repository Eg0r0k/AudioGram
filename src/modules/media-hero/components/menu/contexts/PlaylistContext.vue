<template>
  <component
    :is="Item"
    @click="actions.addToQueue"
  >
    <IconPlaylistAdd class="size-5.5" />
    {{ $t('common.addToQueue') }}
  </component>

  <component
    :is="Item"
    v-if="actions.canDownloadOffline?.value"
    @click="actions.downloadOffline?.()"
  >
    <IconDownload class="size-5.5" />
    {{ $t('media.contextMenu.downloadPlaylist') }}
  </component>

  <component :is="Separator" />

  <template v-if="isOwner">
    <component
      :is="Item"
      @click="actions.edit"
    >
      <IconPencil class="size-5.5" />
      {{ $t('common.edit') }}
    </component>

    <component
      :is="Item"
      variant="destructive"
      @click="actions.delete"
    >
      <IconTrash class="size-5.5" />
      {{ $t('common.delete') }}
    </component>
  </template>
</template>

<script setup lang="ts">
import IconDownload from "~icons/tabler/download";
import IconPencil from "~icons/tabler/pencil";
import IconTrash from "~icons/tabler/trash";
import IconPlaylistAdd from "~icons/tabler/playlist-add";
import { useMenuComponents } from "@/modules/media-hero/composables/useMenuComponents";
import type { MediaActions } from "../types";

defineProps<{
  actions: MediaActions;
  isOwner?: boolean;
}>();

const { Item, Separator } = useMenuComponents();
</script>
