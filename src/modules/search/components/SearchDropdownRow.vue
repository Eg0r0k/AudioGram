<script setup lang="ts">
import { computed } from "vue";
import type { SearchResultItem } from "@/modules/search/types";
import type { Track } from "@/modules/player/types";
import type { LibraryItem } from "@/modules/library/types";
import type { RouteLocationRaw } from "vue-router";
import TrackRow from "@/modules/tracks/components/TrackRow.vue";
import LibrarySidebarItem from "@/components/layout/sidebar/LibrarySidebarItem.vue";
import { routeLocation } from "@/app/router/route-locations";

const props = defineProps<{ item: SearchResultItem; track?: Track }>();
const emit = defineEmits<{ click: [] }>();

function routeForItem(item: SearchResultItem): RouteLocationRaw {
  switch (item.type) {
    case "artist": return routeLocation.artist(item.entityId);
    case "album": return routeLocation.album(item.entityId);
    case "playlist": return routeLocation.playlist(item.entityId);
    default: return routeLocation.home();
  }
}

const libraryItem = computed<LibraryItem>(() => ({
  id: props.item.entityId,
  type: props.item.type as "artist" | "album" | "playlist",
  title: props.item.title,
  subtitle: props.item.artist,
  image: props.item.coverPath,
  isPinned: false,
  addedAt: 0,
  rounded: props.item.type === "artist",
  to: routeForItem(props.item),
}));
</script>

<template>
  <TrackRow
    v-if="item.type === 'track' && track"
    :track="track"
    :cover-url="item.coverPath"
    hide-index
    menu-target="search"
    @play="emit('click')"
  />

  <LibrarySidebarItem
    v-else-if="item.type !== 'track'"
    :item="libraryItem"
  />
</template>
