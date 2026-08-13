<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { YtChip } from "@/modules/search/composables/useSearch";

defineProps<{ chip: YtChip }>();

const emit = defineEmits<{
  "update:chip": [chip: YtChip];
}>();

const { t } = useI18n();

const CHIPS: YtChip[] = ["all", "tracks", "albums", "artists", "playlists", "videos"];

const chipLabels: Record<YtChip, string> = {
  all: t("youtube.chip.all"),
  tracks: t("youtube.chip.tracks"),
  albums: t("youtube.chip.albums"),
  artists: t("youtube.chip.artists"),
  playlists: t("youtube.chip.playlists"),
  videos: t("youtube.chip.videos"),
};
</script>

<template>
  <Scrollable
    direction="horizontal"
    hide-thumb
    class="shrink-0 border-b border-background"
  >
    <Tabs
      :model-value="chip"
      @update:model-value="emit('update:chip', $event as YtChip)"
    >
      <TabsList class="inline-flex items-center gap-0 px-4">
        <TabsTrigger
          v-for="value in CHIPS"
          :key="value"
          class="text-base font-medium mb-0.5"
          :value="value"
        >
          {{ chipLabels[value] }}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  </Scrollable>
</template>
