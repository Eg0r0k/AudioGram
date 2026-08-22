<script setup lang="ts">
import type { LibraryItem } from "@/modules/library/types";
import { Badge } from "@/components/ui/badge";
import { ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import IconPinFilled from "~icons/tabler/pin-filled";
import IconVolume from "~icons/tabler/volume";

// The text column of a full-width library row: title with the now-playing
// indicator, then the typed subtitle with the pin marker and (for folders)
// the entry count badge. Compact rows skip this component entirely.
defineProps<{
  item: LibraryItem;
  subtitle: string;
  active?: boolean;
  isPlaybackSource?: boolean;
}>();
</script>

<template>
  <ItemContent class="min-w-0 overflow-hidden">
    <ItemTitle
      class="block min-w-0 w-full! overflow-hidden text-ellipsis whitespace-nowrap"
      :class="active ? 'text-primary-foreground' : ''"
    >
      <span class="flex items-center min-w-0 gap-1">
        <span
          class="truncate"
          :title="item.title"
        >
          {{ item.title }}
        </span>

        <IconVolume
          v-if="isPlaybackSource"
          class="size-5 shrink-0"
          :class="active ? 'text-white' : 'text-primary'"
        />
      </span>
    </ItemTitle>

    <ItemDescription
      class="block min-w-0"
      :class="active ? 'text-primary-foreground' : ''"
    >
      <span class="flex items-center min-w-0 gap-1">
        <span
          class="min-w-0 flex-1 truncate"
          :title="subtitle"
        >
          {{ subtitle }}
        </span>

        <IconPinFilled
          v-if="item.isPinned"
          class="size-5 shrink-0"
          :class="active ? 'text-white' : 'text-primary'"
        />

        <Badge
          v-if="item.type === 'folder'"
          variant="secondary"
          size="md"
          class="shrink-0 h-5 min-w-5 px-1 py-0 font-medium! text-white!"
        >{{ item.folderItemCount ?? 0 }}</Badge>
      </span>
    </ItemDescription>
  </ItemContent>
</template>
