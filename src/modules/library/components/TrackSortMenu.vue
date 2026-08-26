<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-lg"
        class="shrink-0 rounded-full"
        :class="sortKey && 'text-foreground'"
        :aria-label="t('library.sortBy')"
        :title="t('library.sortBy')"
      >
        <IconSort class="size-6" />
      </Button>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      align="end"
      class="min-w-52"
    >
      <DropdownMenuLabel>{{ t('library.sortBy') }}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="field in SORT_FIELDS"
        :key="field.value"
        @select="toggle(field.value)"
      >
        <span class="flex-1 truncate">{{ t(field.labelKey) }}</span>
        <IconChevronDown
          v-if="directionOf(field.value) === 'asc'"
          class="size-3.5 rotate-180 text-green-400!"
        />
        <IconChevronDown
          v-else-if="directionOf(field.value) === 'desc'"
          class="size-3.5 text-green-400!"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { TrackSortKey } from "@/modules/tracks/types";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconSort from "~icons/tabler/arrows-sort";
import { getNextTrackSortKey, getTrackSortDirection, type TrackSortField } from "../lib/trackSort";

const SORT_FIELDS: readonly { value: TrackSortField; labelKey: string }[] = [
  { value: "title", labelKey: "library.sortColumn.title" },
  { value: "artist", labelKey: "library.sortColumn.artist" },
  { value: "album", labelKey: "library.sortColumn.album" },
  { value: "dateAdded", labelKey: "library.sortColumn.dateAdded" },
  { value: "duration", labelKey: "library.sortColumn.duration" },
];

const props = defineProps<{
  sortKey: TrackSortKey | null;
}>();

const emit = defineEmits<{
  "update:sortKey": [value: TrackSortKey | null];
}>();

const { t } = useI18n();

const directionOf = (field: TrackSortField) => getTrackSortDirection(props.sortKey, field);

const toggle = (field: TrackSortField) => {
  emit("update:sortKey", getNextTrackSortKey(props.sortKey, field));
};
</script>
