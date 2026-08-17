<template>
  <EntitySelectPanel
    v-model:search="search"
    :title="t('track.edit.selectArtists')"
    :items="suggestions"
    :get-key="(artist: ArtistEntity) => artist.id"
    :can-create="canCreate"
    :confirm-count="selectedNames.length"
    @confirm="handleConfirm"
    @create="handleCreate"
    @back="rightPanel.back()"
    @close="rightPanel.close()"
  >
    <template #row="{ item }">
      <Item
        as="button"
        type="button"
        class="w-full cursor-pointer gap-3 px-2 py-2 text-left"
        @click="toggleName(item.name)"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="artist"
            :owner-id="item.id"
            :alt="item.name"
            image-class="size-10 rounded-full object-cover"
          />
        </ItemMedia>
        <ItemContent class="min-w-0">
          <ItemTitle class="w-full text-sm font-normal">
            <span class="min-w-0 truncate">{{ item.name }}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <IconCheck
            v-if="isSelectedName(item.name)"
            class="size-5 text-primary"
          />
        </ItemActions>
      </Item>
    </template>
  </EntitySelectPanel>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { refDebounced } from "@vueuse/core";
import { useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { EntitySelectPanel } from "@/components/entity-select";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import type { ArtistEntity } from "@/db/entities";
import { searchArtists } from "@/queries/artist.queries";
import { queryKeys } from "@/queries/query-keys";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import IconCheck from "~icons/tabler/check";

const props = defineProps<{ payload: RightPanelEntitySelectPayload }>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();

const search = ref("");
const debouncedSearch = refDebounced(search, 200);
const normalizedSearch = computed(() => debouncedSearch.value.trim().replace(/\s+/g, " "));

const selectedNames = ref<string[]>([...(props.payload.selectedNames ?? [])]);
const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const isSelectedName = (name: string) => selectedNames.value.some(item => nameKey(item) === nameKey(name));

const toggleName = (name: string) => {
  selectedNames.value = isSelectedName(name)
    ? selectedNames.value.filter(item => nameKey(item) !== nameKey(name))
    : [...selectedNames.value, name];
};

const { data } = useQuery({
  queryKey: computed(() => queryKeys.artists.search(normalizedSearch.value)),
  queryFn: () => searchArtists(normalizedSearch.value, 30),
});
const suggestions = computed(() => data.value ?? []);

const canCreate = computed(() =>
  normalizedSearch.value.length > 0
  && !suggestions.value.some(artist => nameKey(artist.name) === nameKey(normalizedSearch.value)),
);

const handleCreate = (name: string) => {
  if (!isSelectedName(name)) selectedNames.value = [...selectedNames.value, name];
  search.value = "";
};

const handleConfirm = () => {
  props.payload.onConfirm({ names: [...selectedNames.value] });
  rightPanel.back();
};
</script>
