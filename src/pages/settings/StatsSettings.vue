<template>
  <Scrollable
    direction="vertical"
    class="flex-1"
  >
    <div class="pb-8">
      <SettingsHeader :title="$t('settings.stats.title')" />

      <template v-if="hasHistory">
        <SettingsGroup>
          <StatsPeriodSwitcher v-model="period" />
        </SettingsGroup>
        <StatsSummary :since="since" />
        <StatsStreakSection />
        <StatsTopTracks :since="since" />
        <StatsTopArtists :since="since" />

        <StatsCompletionRow :since="since" />
        <StatsHourlyRow :since="since" />

        <StatsRecords :since="since" />
        <StatsTopGenres :since="since" />

        <SettingsGroup class="mt-3">
          <div class="px-4 py-3">
            <div class="mb-1 text-primary font-medium">
              {{ $t("settings.stats.clear") }}
            </div>
            <div class="text-sm text-muted-foreground">
              {{ $t("settings.stats.clearDesc") }}
            </div>
          </div>
          <Button
            class="w-full h-14 justify-start"
            size="xl"
            variant="ghost-primary"
            :disabled="isClearing"
            @click="isClearOpen = true"
          >
            <IconTrash class="size-6" />
            {{ $t("settings.stats.clear") }}
          </Button>
        </SettingsGroup>
      </template>

      <SettingsGroup v-else>
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">
          {{ $t("settings.stats.empty") }}
        </p>
      </SettingsGroup>
    </div>

    <ClearHistoryDialog
      v-model:open="isClearOpen"
      :pending="isClearing"
      @confirm="handleClearConfirm"
    />
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { Scrollable } from "@/components/ui/scrollable";
import { Button } from "@/components/ui/button";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import IconTrash from "~icons/tabler/trash";
import StatsPeriodSwitcher from "./components/stats/StatsPeriodSwitcher.vue";
import StatsSummary from "./components/stats/StatsSummary.vue";
import StatsStreakSection from "./components/stats/StatsStreakSection.vue";
import StatsTopTracks from "./components/stats/StatsTopTracks.vue";
import StatsTopArtists from "./components/stats/StatsTopArtists.vue";
import StatsCompletionRow from "./components/stats/StatsCompletionRow.vue";
import StatsHourlyRow from "./components/stats/StatsHourlyRow.vue";
import StatsRecords from "./components/stats/StatsRecords.vue";
import StatsTopGenres from "./components/stats/StatsTopGenres.vue";
import ClearHistoryDialog from "./components/stats/ClearHistoryDialog.vue";
import type { StatsPeriod } from "./components/stats/period";
import { periodSince } from "./components/stats/period";
import { statsQueries } from "@/queries/stats.queries";
import { statsService } from "@/services/stats.service";

const { t } = useI18n();

const period = ref<StatsPeriod>("month");
const since = computed(() => periodSince(period.value));

// Есть ли история вообще (за всё время) — иначе показываем пустое состояние.
const { data: allTime } = useQuery(statsQueries.summary(undefined));
const hasHistory = computed(() =>
  allTime.value === undefined
  || allTime.value.totalSeconds > 0
  || allTime.value.playsCount > 0,
);

const isClearOpen = ref(false);
const isClearing = ref(false);

async function handleClearConfirm() {
  isClearing.value = true;
  try {
    await statsService.clearHistory();
    isClearOpen.value = false;
    toast.success(t("settings.stats.cleared"));
  }
  catch (error) {
    console.error("Failed to clear listening history", error);
    toast.error(t("errors.unknown"));
  }
  finally {
    isClearing.value = false;
  }
}
</script>
