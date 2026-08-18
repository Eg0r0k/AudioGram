<template>
  <SettingsGroup class="mt-3">
    <Item>
      <ItemMedia>
        <IconFlame class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.streakCurrent", streaks?.current ?? 0) }}</ItemTitle>
        <ItemSubtitle>{{ $t("settings.stats.streakBest", streaks?.best ?? 0) }}</ItemSubtitle>
      </ItemContent>
    </Item>
    <div class="px-4 pb-3">
      <div
        v-if="isDailyLoading"
        class="h-40 animate-pulse rounded-lg bg-background"
      />
      <CalendarHeatmap
        v-else
        :data="dailyActivity ?? []"
      />
    </div>
  </SettingsGroup>
</template>

<script setup lang="ts">
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import CalendarHeatmap from "@/components/ui/charts/CalendarHeatmap.vue";
import { useDailyActivity, useStreaks } from "@/composables/useStatsQueries";
import IconFlame from "~icons/tabler/flame";

const { data: streaks } = useStreaks();
const { data: dailyActivity, isLoading: isDailyLoading } = useDailyActivity(365);
</script>
