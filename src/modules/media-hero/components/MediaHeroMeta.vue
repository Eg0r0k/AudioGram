<template>
  <div class="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-center text-sm leading-relaxed text-foreground/70 @lg:justify-start @lg:text-left">
    <template v-if="isPlaylist(data)">
      <span
        v-if="data.ownerName"
        class="font-medium text-foreground/90"
      >
        {{ data.ownerName }}
      </span>
      <span
        v-if="data.ownerName"
        class="opacity-60"
      >·</span>
      <span>{{ t('common.trackCount', data.trackCount) }}</span>
      <template v-if="data.duration">
        <span class="opacity-60">·</span>
        <span>{{ data.duration }}</span>
      </template>
    </template>

    <template v-else-if="isArtist(data)">
      <span>{{ formatListeners(data.monthlyListeners) }}</span>
    </template>

    <template v-else-if="isAlbum(data)">
      <RouterLink
        :to="routeLocation.artist(data.artistId, artistIntent)"
        class="font-medium text-white/90 hover:text-white hover:underline underline-offset-2 transition-colors duration-200"
      >
        {{ data.artistName }}
      </RouterLink>
      <span class="opacity-60">·</span>
      <span>{{ data.releaseYear }}</span>
      <span class="opacity-60">·</span>
      <span>{{ t('common.trackCount', data.trackCount) }}</span>
      <template v-if="data.duration">
        <span class="opacity-60">·</span>
        <span>{{ data.duration }}</span>
      </template>
    </template>

    <template v-else-if="isLiked(data)">
      <span>{{ t('common.trackCount', data.trackCount) }}</span>
      <template v-if="data.duration">
        <span class="opacity-60">·</span>
        <span>{{ data.duration }}</span>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { routeLocation, wantsCatalogView } from "@/app/router/route-locations";
import { isAlbum, isArtist, isLiked, isPlaylist, MediaData } from "@/modules/media-hero/types";

defineProps<{
  data: MediaData;
}>();

// Following an artist link out of a catalog album stays in that catalog:
// the album was the source's view, so its artist should be too.
const route = useRoute();
const artistIntent = computed(() => ({ catalog: wantsCatalogView(route.query) }));

const { t } = useI18n();

function formatListeners(count: number): string {
  if (count >= 1_000_000) {
    return t("media.monthlyListeners", { count: `${(count / 1_000_000).toFixed(1)}M` });
  }
  if (count >= 1_000) {
    return t("media.monthlyListeners", { count: `${(count / 1_000).toFixed(0)}K` });
  }
  return t("media.monthlyListeners", { count });
}
</script>
