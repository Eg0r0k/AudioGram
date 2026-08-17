<template>
  <EntitySelectPanel
    v-model:search="search"
    :title="t('track.edit.selectAlbum')"
    :items="suggestions"
    :get-key="(album: AlbumEntity) => album.id"
    :can-create="canCreate"
    @create="handleCreate"
    @back="rightPanel.back()"
    @close="rightPanel.close()"
  >
    <template #row="{ item }">
      <Item
        as="button"
        type="button"
        class="w-full cursor-pointer gap-3 px-2 py-2 text-left"
        @click="handleSelect(item)"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="album"
            :owner-id="item.id"
            :alt="item.title"
            image-class="size-10 rounded-md object-cover"
          />
        </ItemMedia>
        <ItemContent class="min-w-0">
          <ItemTitle class="w-full text-sm font-normal">
            <span class="min-w-0 truncate">{{ item.title }}</span>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <IconCheck
            v-if="item.id === payload.selectedAlbumId"
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
import type { AlbumEntity } from "@/db/entities";
import { searchAlbums } from "@/queries/album.queries";
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

const { data } = useQuery({
  queryKey: computed(() => queryKeys.albums.search(normalizedSearch.value)),
  queryFn: () => searchAlbums(normalizedSearch.value),
});
const suggestions = computed(() => data.value ?? []);

const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
const canCreate = computed(() =>
  normalizedSearch.value.length > 0
  && !suggestions.value.some(album => titleKey(album.title) === titleKey(normalizedSearch.value)),
);

const handleSelect = (album: AlbumEntity) => {
  props.payload.onConfirm({ albumId: album.id });
  rightPanel.back();
};

const handleCreate = (title: string) => {
  props.payload.onConfirm({ albumTitle: title });
  rightPanel.back();
};
</script>
