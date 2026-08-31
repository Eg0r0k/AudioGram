<template>
  <div class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="flex items-center gap-3 px-4 pb-2 pt-4 sm:px-6">
      <Button
        variant="ghost"
        size="icon-lg"
        class="shrink-0 rounded-full"
        :aria-label="$t('common.back')"
        @click="goBack()"
      >
        <IconArrowLeft class="size-6" />
      </Button>

      <div class="min-w-0 flex-1">
        <h1 class="truncate text-xl font-semibold">
          {{ $t('artist.albums') }}
        </h1>
        <p
          v-if="artistData"
          class="truncate text-sm text-muted-foreground"
        >
          {{ artistData.title }} · {{ $t('common.albums', { count: albumCount }) }}
        </p>
      </div>
    </div>

    <div
      v-if="isLoading"
      :class="gridClass"
    >
      <div
        v-for="i in 8"
        :key="i"
        class="p-2"
      >
        <Skeleton class="aspect-square w-full rounded-md" />
        <Skeleton class="mt-3 h-4 w-3/4" />
        <Skeleton class="mt-2 h-3 w-1/2" />
      </div>
    </div>

    <PageErrorState
      v-else-if="isError"
      :message="errorMessage"
      @retry="refetch"
    />

    <LibraryContextMenu
      v-else
      @delete="deleteLibraryItem"
    >
      <Scrollable
        ref="scrollableRef"
        class="min-h-0 flex-1"
        @scrolled-bottom="loadMore"
      >
        <div
          v-if="albumItems.length > 0"
          :class="gridClass"
        >
          <AlbumItem
            v-for="albumItem in albumItems"
            :key="albumItem.id"
            :item="albumItem"
            fluid
            @play="playAlbum"
          />
        </div>

        <Empty
          v-else
          class="p-4 py-12 sm:px-6 md:py-12"
        >
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              class="rounded-full text-muted-foreground"
            >
              <IconVinyl class="size-5" />
            </EmptyMedia>
            <EmptyDescription>{{ $t('artist.noAlbums') }}</EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div
          v-if="isFetchingNextAlbumPage"
          class="flex justify-center py-4"
        >
          <IconLoader2 class="size-6 animate-spin text-muted-foreground" />
        </div>
      </Scrollable>
    </LibraryContextMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Scrollable } from "@/components/ui/scrollable";
import { useScrollRestoration } from "@/components/ui/scrollable/useScrollRestoration";
import { Skeleton } from "@/components/ui/skeleton";
import PageErrorState from "@/components/common/PageErrorState.vue";
import IconArrowLeft from "~icons/tabler/arrow-left";
import IconLoader2 from "~icons/tabler/loader-2";
import IconVinyl from "~icons/tabler/vinyl";
import { routeLocation, wantsCatalogView } from "@/app/router/route-locations";
import { useGoBack } from "@/composables/useGoBack";
import AlbumItem from "@/modules/albums/components/AlbumItem.vue";
import { usePlayAlbum } from "@/modules/albums/composables/usePlayAlbum";
import { useArtistPage } from "@/modules/artists/composables/useArtistPage";
import LibraryContextMenu from "@/modules/library/components/LibraryContextMenu.vue";
import { useLibrary } from "@/modules/library/composables/useLibrary";
import type { LibraryItem } from "@/modules/library/types";
import type { TrackSortKey } from "@/modules/tracks/types";
import { getLogger } from "@/lib/logger";

const { t } = useI18n();
const route = useRoute();
const { isPinned, deleteItem: deleteLibraryItem } = useLibrary();
const { playAlbum } = usePlayAlbum();

// Same data hook as the artist page: the album pages and the artist row
// are already cached from there, so this page opens instantly.
const sortKey = ref<TrackSortKey | null>(null);
const {
  artist,
  artistData,
  albums,
  albumCovers,
  albumCount,
  isLoading,
  isError,
  error,
  refetch,
  fetchNextAlbumPage,
  hasNextAlbumPage,
  isFetchingNextAlbumPage,
} = useArtistPage(sortKey);

// Going back from a catalog album list lands on the catalog artist, not on
// the library row that may share its id.
const goBack = useGoBack(
  routeLocation.artist(route.params.id as string, { catalog: wantsCatalogView(route.query) }),
);

const gridClass = "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-2 gap-y-3 px-4 pb-6 pt-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:px-6";

const albumItems = computed<LibraryItem[]>(() => albums.value.map(album => ({
  id: album.id,
  type: "album",
  title: album.title,
  image: albumCovers.value.get(album.id),
  subtitle: album.year ? String(album.year) : artistData.value?.title,
  isPinned: isPinned("album", album.id),
  addedAt: album.addedAt,
  updatedAt: album.updatedAt,
  artistName: artistData.value?.title,
  to: routeLocation.album(album.id, { catalog: !artist.value }),
  rounded: false,
  isCatalog: !artist.value,
})));

const errorMessage = computed(() => {
  if (!error.value) return t("errors.unknown");
  if (error.value.message === "Artist not found") return t("errors.notFound");
  return t("errors.loadFailed");
});

const loadMore = () => {
  if (!hasNextAlbumPage.value || isFetchingNextAlbumPage.value) return;
  // The query keeps its own error state for the UI; the log is what tells us
  // WHY a scroll stopped loading more albums.
  fetchNextAlbumPage().catch((err: unknown) => {
    getLogger().warn(`[ArtistAlbumsPage] Loading the next album page failed: ${String(err)}`);
  });
};

const scrollableRef = useTemplateRef("scrollableRef");
useScrollRestoration(scrollableRef, {
  key: () => `artist-albums:${String(route.params.id)}`,
  ready: () => !isLoading.value,
  deps: () => albums.value.length,
});
</script>
