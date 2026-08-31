<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { SearchFilter } from "@/modules/search/types";
import { Scrollable } from "@/components/ui/scrollable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

defineProps<{
  activeFilter: SearchFilter;
  availableFilters: readonly { value: SearchFilter; label: string }[];
}>();

const emit = defineEmits<{
  "update:filter": [filter: SearchFilter];
}>();

const { t } = useI18n();

const filterLabels: Record<SearchFilter, string> = {
  all: t("search.filter.all"),
  track: t("search.filter.track"),
  artist: t("library.filterArtists"),
  album: t("library.filterAlbums"),
  playlist: t("library.filterPlaylists"),
};

function filterLabel(value: SearchFilter) {
  return filterLabels[value];
}
</script>

<template>
  <Scrollable
    direction="horizontal"
    hide-thumb
    class="shrink-0 border-b border-background"
  >
    <Tabs
      :model-value="activeFilter"
      @update:model-value="emit('update:filter', $event as SearchFilter)"
    >
      <TabsList class="inline-flex items-center gap-0 px-4">
        <TabsTrigger
          v-for="filter in availableFilters"
          :key="filter.value"
          class="text-base font-medium mb-0.5"
          :value="filter.value"
        >
          {{ filterLabel(filter.value) }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </Scrollable>
</template>
