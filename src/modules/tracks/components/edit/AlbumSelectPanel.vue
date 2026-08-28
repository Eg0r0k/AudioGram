<template>
  <EntitySelectPanel
    v-model:search="search"
    :title="t('track.edit.selectAlbum')"
    :items="suggestions"
    :get-key="(album: AlbumEntity) => album.id"
    :can-create="canCreate"
    :show-confirm="isDirty"
    @confirm="handleConfirm"
    @create="handleCreate"
    @back="handleDone"
    @close="rightPanel.close()"
  >
    <template #row="{ item }">
      <Item
        as="button"
        type="button"
        class="w-full cursor-pointer gap-3 px-2 py-2 text-left"
        @click="toggleAlbum(item)"
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
            v-if="selected?.id === item.id"
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
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { EntitySelectPanel } from "@/components/entity-select";
import { identityKey } from "@/lib/artist-names";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import type { AlbumEntity } from "@/db/entities";
import { searchAlbums } from "@/queries/album.queries";
import { queryKeys } from "@/queries/query-keys";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { usePanelUiBack } from "@/modules/right-panel/composables/usePanelUiBack";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import IconCheck from "~icons/tabler/check";

const props = defineProps<{ payload: RightPanelEntitySelectPayload }>();

const { t } = useI18n();
const rightPanel = useRightPanelStore();

const search = ref("");
const debouncedSearch = refDebounced(search, 200);
const normalizedSearch = computed(() => debouncedSearch.value.trim().replace(/\s+/g, " "));

// Pending pick, confirmed only through the floating button (same flow as
// the artist picker). `id` undefined = a title the user typed (new album);
// null = album-less. Tapping the selected row again clears the pick.
interface AlbumPick {
  id?: string;
  title: string;
}

const initialPick = (): AlbumPick | null =>
  props.payload.selectedAlbumId ? { id: props.payload.selectedAlbumId, title: "" } : null;

const selected = ref<AlbumPick | null>(initialPick());
const isDirty = computed(() => (selected.value?.id ?? selected.value?.title ?? null) !== (initialPick()?.id ?? null));

const toggleAlbum = (album: AlbumEntity) => {
  selected.value = selected.value?.id === album.id ? null : { id: album.id, title: album.title };
};

const PICKER_LIMIT = 1000;

const { data } = useQuery({
  queryKey: computed(() => queryKeys.albums.search(normalizedSearch.value)),
  queryFn: () => searchAlbums(normalizedSearch.value, PICKER_LIMIT),
  placeholderData: keepPreviousData,
});
const suggestions = computed(() =>
  [...(data.value ?? [])].sort((a, b) => a.title.localeCompare(b.title)),
);

const canCreate = computed(() =>
  normalizedSearch.value.length > 0
  && !suggestions.value.some(album => identityKey(album.title) === identityKey(normalizedSearch.value)),
);

const handleDone = () => {
  if (props.payload.onDone) {
    props.payload.onDone();
    return;
  }

  rightPanel.back();
};
usePanelUiBack(handleDone);

const handleCreate = (title: string) => {
  selected.value = { title };
  search.value = "";
};

const handleConfirm = () => {
  const pick = selected.value;
  if (!pick) {
    props.payload.onConfirm({});
  }
  else if (pick.id) {
    // A confirmable pick always came from a tapped row or a typed title,
    // so the title is set even though the payload only carries an id.
    props.payload.onConfirm({ albumId: pick.id, albumTitle: pick.title });
  }
  else {
    props.payload.onConfirm({ albumTitle: pick.title });
  }
  handleDone();
};
</script>
