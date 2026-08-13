<template>
  <YtCollectionView
    :title="album?.title ?? ''"
    kind="album"
    :owner="albumArtist"
    :artists="album?.artists"
    :track-count="album?.trackCount"
    :thumbnail="album?.thumbnail"
    :tracks="album?.tracks ?? []"
    :is-loading="isLoading"
    :error="queryError"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import YtCollectionView from "@/modules/youtube/components/collection/YtCollectionView.vue";
import { useYtAlbum } from "@/modules/youtube/composables/useYtSearchQueries";
import type { YoutubeError } from "@/modules/youtube/types";

const route = useRoute();
const albumId = computed(() => String(route.params.id ?? ""));

const { data: album, isLoading, error } = useYtAlbum(albumId);

const albumArtist = computed(
  () => album.value?.artists.map(artist => artist.name).join(", ") || null,
);
const queryError = computed(() => (error.value as unknown as YoutubeError) ?? null);
</script>
