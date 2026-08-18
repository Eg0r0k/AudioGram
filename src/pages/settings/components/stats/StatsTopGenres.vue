<template>
  <SettingsGroup
    v-if="genres.length > 0"
    class="mt-3"
  >
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.topGenres") }}
    </div>
    <div class="flex flex-col gap-2 px-4 pb-4">
      <div
        v-for="genre in genres"
        :key="genre.id"
        class="flex items-center gap-3"
      >
        <span class="w-28 shrink-0 truncate text-sm">{{ genre.name }}</span>
        <div class="h-1.5 flex-1 rounded-full bg-background">
          <div
            class="h-full rounded-full bg-primary"
            :style="{ width: `${barPercent(genre.secondsListened)}%` }"
          />
        </div>
        <span class="shrink-0 text-sm text-muted-foreground tabular-nums">
          {{ formatTotalDuration(genre.secondsListened, t) }}
        </span>
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useTopGenres } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const { t } = useI18n();
const { data } = useTopGenres(5, () => props.since);

const genres = computed(() => data.value ?? []);
const maxSeconds = computed(() => genres.value[0]?.secondsListened ?? 1);
const barPercent = (seconds: number) => Math.max(2, Math.round((seconds / maxSeconds.value) * 100));
</script>
