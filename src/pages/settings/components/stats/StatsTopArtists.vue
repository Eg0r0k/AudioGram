<template>
  <SettingsGroup class="mt-3">
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topArtists") }}
    </div>

    <div
      v-if="isLoading"
      class="mx-2 mb-2 h-40 animate-pulse rounded-lg bg-background"
    />
    <p
      v-else-if="topArtists.length === 0"
      class="px-4 pb-4 text-sm text-muted-foreground"
    >
      {{ $t("settings.stats.emptyPeriod") }}
    </p>

    <template v-else>
      <Item
        v-for="entry in topArtists"
        :key="entry.id"
        as="button"
        type="button"
        class="w-full cursor-pointer text-left"
        @click="goToArtist(entry.artist.id)"
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="artist"
            :owner-id="entry.artist.id"
            :alt="entry.artist.name"
            image-class="size-10 rounded-full object-cover"
          />
        </ItemMedia>
        <ItemContent class="ml-3 min-w-0">
          <ItemTitle class="truncate">
            {{ entry.artist.name }}
          </ItemTitle>
          <ItemSubtitle class="truncate">
            {{ formatTotalDuration(entry.secondsListened, t) }}
          </ItemSubtitle>
        </ItemContent>
      </Item>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { useTopArtists } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";
import { routeLocation } from "@/app/router/route-locations";

const props = defineProps<{ since?: number }>();

const TOP_LIMIT = 5;

const { t } = useI18n();
const router = useRouter();
const { topArtists, isLoading } = useTopArtists(TOP_LIMIT, () => props.since);

function goToArtist(id: string) {
  router.push(routeLocation.artist(id));
}
</script>
