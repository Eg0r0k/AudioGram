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
      >
        <ItemMedia>
          <EntityCoverImage
            owner-type="artist"
            :owner-id="entry.artist!.id"
            :alt="entry.artist!.name"
            image-class="size-10 rounded-full object-cover"
          />
        </ItemMedia>
        <ItemContent class="ml-3 min-w-0">
          <ItemTitle class="truncate">
            {{ entry.artist!.name }}
          </ItemTitle>
          <div class="mt-1.5 h-1 w-full rounded-full bg-background">
            <div
              class="h-full rounded-full bg-primary"
              :style="{ width: `${barPercent(entry.secondsListened)}%` }"
            />
          </div>
        </ItemContent>
        <ItemActions>
          <span class="ml-3 shrink-0 text-sm text-muted-foreground tabular-nums">
            {{ formatTotalDuration(entry.secondsListened, t) }}
          </span>
        </ItemActions>
      </Item>

      <Button
        v-if="expanded || topArtists.length >= COLLAPSED_LIMIT"
        variant="ghost-primary"
        class="w-full"
        @click="expanded = !expanded"
      >
        {{ expanded ? $t("settings.stats.showLess") : $t("settings.stats.showAll") }}
      </Button>
    </template>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import EntityCoverImage from "@/components/ui/EntityCoverImage.vue";
import { useTopArtists } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const COLLAPSED_LIMIT = 5;
const EXPANDED_LIMIT = 25;

const { t } = useI18n();
const expanded = ref(false);
const limit = computed(() => (expanded.value ? EXPANDED_LIMIT : COLLAPSED_LIMIT));

const { topArtists, isLoading } = useTopArtists(limit, () => props.since);

const maxSeconds = computed(() => topArtists.value[0]?.secondsListened ?? 1);
const barPercent = (seconds: number) => Math.max(2, Math.round((seconds / maxSeconds.value) * 100));
</script>
