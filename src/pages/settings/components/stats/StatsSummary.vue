<template>
  <SettingsGroup class="mt-3">
    <div
      v-if="isLoading"
      class="mx-2 my-3 h-16 animate-pulse rounded-lg bg-background"
    />
    <div
      v-else
      class="grid grid-cols-3 gap-2 px-2 py-4"
    >
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ timeLabel }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryTime") }}</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ summary?.playsCount ?? 0 }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryPlays") }}</span>
      </div>
      <div class="flex flex-col items-center gap-1">
        <span class="text-lg font-semibold tabular-nums">{{ summary?.uniqueArtists ?? 0 }}</span>
        <span class="text-xs text-muted-foreground">{{ $t("settings.stats.summaryArtists") }}</span>
      </div>
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useStatsSummary } from "@/composables/useStatsQueries";
import { formatTotalDuration } from "@/lib/format/time";

const props = defineProps<{ since?: number }>();

const { t } = useI18n();
const { data: summary, isLoading } = useStatsSummary(() => props.since);

const timeLabel = computed(() => formatTotalDuration(summary.value?.totalSeconds ?? 0, t));
</script>
