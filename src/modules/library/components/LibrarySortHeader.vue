<template>
  <div class="library-sort-header-container border-b border-border/40 px-4 sm:px-6">
    <div class="library-sort-header">
      <div class="index-col flex items-center pl-3">
        <IconHashtag class="size-4" />
      </div>

      <Button
        variant="ghost"
        class="first-col justify-start gap-2 truncate px-2 font-medium"
        :disabled="!sortable"
        @click="toggle('title')"
      >
        <span class="truncate">{{ $t('library.sortColumn.title') }}</span>
        <IconChevronDown
          v-if="sortKey === 'title_asc'"
          class="size-3 rotate-180 text-green-400"
        />
        <IconChevronDown
          v-else-if="sortKey === 'title_desc'"
          class="size-3 text-green-400"
        />
      </Button>

      <Button
        variant="ghost"
        class="var1-col justify-start gap-2 truncate px-2 font-medium"
        :disabled="!sortable"
        @click="toggle('album')"
      >
        <span class="truncate">{{ $t('library.sortColumn.album') }}</span>
        <IconChevronDown
          v-if="sortKey === 'album_asc'"
          class="size-3 rotate-180 text-green-400"
        />
        <IconChevronDown
          v-else-if="sortKey === 'album_desc'"
          class="size-3 text-green-400"
        />
      </Button>

      <Button
        variant="ghost"
        class="var2-col justify-start truncate px-2 font-medium"
        :disabled="!sortable"
        @click="toggle('dateAdded')"
      >
        <span class="truncate">{{ $t('library.sortColumn.dateAdded') }}</span>
        <IconChevronDown
          v-if="sortKey === 'date_added_asc'"
          class="size-3 rotate-180 text-green-400"
        />
        <IconChevronDown
          v-else-if="sortKey === 'date_added_desc'"
          class="size-3 text-green-400"
        />
      </Button>

      <Button
        class="last-col"
        variant="ghost"
        :disabled="!sortable"
        @click="toggle('duration')"
      >
        <IconClock class="size-5" />
        <IconChevronDown
          v-if="sortKey === 'duration_asc'"
          class="ml-1 size-3 rotate-180 text-green-400"
        />
        <IconChevronDown
          v-else-if="sortKey === 'duration_desc'"
          class="ml-1 size-3 text-green-400"
        />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import type { TrackSortKey } from "@/modules/tracks/types";
import IconChevronDown from "~icons/tabler/chevron-down";
import IconClock from "~icons/tabler/clock-hour-4";
import IconHashtag from "~icons/tabler/hash";
import type { TrackSortField } from "../lib/trackSort";
import { getNextTrackSortKey } from "../lib/trackSort";

const props = withDefaults(defineProps<{
  sortKey: TrackSortKey | null;
  // Disabled buttons for sort
  sortable?: boolean;
}>(), {
  sortable: true,
});

const emit = defineEmits<{
  "update:sortKey": [value: TrackSortKey | null];
}>();

function toggle(field: TrackSortField) {
  if (!props.sortable) return;
  emit("update:sortKey", getNextTrackSortKey(props.sortKey, field));
}
</script>

<style scoped>
.library-sort-header-container {
  container-type: inline-size;
}

.library-sort-header {
  display: grid;
  grid-template-columns: var(--grid-template-columns);
  align-items: center;
  height: 48px;
  gap: 12px;
  color: var(--muted-foreground);
}

.index-col { grid-column: index; }
.first-col { grid-column: first; }
.var1-col { grid-column: var1; }
.var2-col { grid-column: var2; }
.last-col { grid-column: last; }

@container (max-width: 900px) {
  .library-sort-header {
    --grid-template-columns: var(--grid-template-columns-medium) !important;
  }

  .var2-col { display: none; }
}

@container (max-width: 620px) {
  .library-sort-header {
    --grid-template-columns: var(--grid-template-columns-small) !important;
    gap: 8px;
  }

  .index-col,
  .var1-col,
  .var2-col { display: none; }
}
</style>
