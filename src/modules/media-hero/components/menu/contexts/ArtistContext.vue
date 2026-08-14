<template>
  <!-- Both write to the artist's Dexie row; a live ND artist has none. -->
  <template v-if="canManage">
    <component
      :is="Item"
      @click="actions.edit"
    >
      <IconPencil class="size-5.5" />
      {{ $t("common.edit") }}
    </component>

    <component
      :is="Item"
      variant="destructive"
      @click="actions.delete"
    >
      <IconTrash class="size-5.5" />
      {{ $t("common.delete") }}
    </component>
  </template>
</template>

<script setup lang="ts">
import { computed } from "vue";
import IconPencil from "~icons/tabler/pencil";
import IconTrash from "~icons/tabler/trash";
import { useMenuComponents } from "@/modules/media-hero/composables/useMenuComponents";
import type { MediaActions } from "../types";

const props = defineProps<{
  actions: MediaActions;
}>();

const canManage = computed(() => props.actions.canManage?.value ?? true);

const { Item } = useMenuComponents();
</script>
