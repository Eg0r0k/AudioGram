<template>
  <div
    v-if="items.length"
    class="px-3 pb-2"
  >
    <div class="flex items-center justify-between px-1 mb-1">
      <p class="text-sm font-medium text-muted-foreground">
        {{ title }}
      </p>
      <Button
        variant="ghost-primary"
        size="sm"
        class="rounded-full text-xs"
        @click="emit('showAll')"
      >
        {{ $t("search.showAll") }}
      </Button>
    </div>
    <SearchDropdownRow
      v-for="item in items"
      :key="item.id"
      :item="item"
      :to="searchResultRoute(item, CATALOG) ?? undefined"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import SearchDropdownRow from "@/modules/search/components/SearchDropdownRow.vue";
import { searchResultRoute } from "@/modules/search/lib/resultItems";
import type { SearchResultItem } from "@/modules/search/types";

// A search result opens the source's view of the entity, not a library row
// that may exist under the same branded id.
const CATALOG = { catalog: true } as const;

defineProps<{
  title: string;
  items: SearchResultItem[];
}>();

const emit = defineEmits<{
  showAll: [];
}>();
</script>
