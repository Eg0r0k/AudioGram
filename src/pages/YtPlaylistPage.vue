<template>
  <YtCollectionView
    :title="meta?.title ?? ''"
    kind="playlist"
    :owner="meta?.owner"
    :description="meta?.description"
    :track-count="meta?.trackCount"
    :thumbnail="meta?.thumbnail"
    :tracks="tracks"
    :is-loading="isLoading"
    :is-fetching-more="isFetchingNextPage"
    :error="queryError"
    @load-more="onLoadMore"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import YtCollectionView from "@/modules/youtube/components/collection/YtCollectionView.vue";
import { useYtPlaylist } from "@/modules/youtube/composables/useYtSearchQueries";
import type { YoutubeError } from "@/modules/youtube/types";

const route = useRoute();
const playlistId = computed(() => String(route.params.id ?? ""));

const {
  data,
  isLoading,
  isFetchingNextPage,
  hasNextPage,
  fetchNextPage,
  error,
} = useYtPlaylist(playlistId);

const meta = computed(() => data.value?.pages[0]?.meta ?? null);
const tracks = computed(() => data.value?.pages.flatMap(page => page.tracks) ?? []);
const queryError = computed(() => (error.value as unknown as YoutubeError) ?? null);

function onLoadMore() {
  if (hasNextPage.value && !isFetchingNextPage.value) {
    fetchNextPage();
  }
}
</script>
