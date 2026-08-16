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
        <!-- Секции добавляются в следующих тасках -->
      </template>

      <SettingsGroup v-else>
        <p class="px-4 py-8 text-center text-sm text-muted-foreground">
          {{ $t("settings.stats.empty") }}
        </p>
      </SettingsGroup>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { Scrollable } from "@/components/ui/scrollable";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import SettingsHeader from "@/modules/settings/components/SettingsHeader.vue";
import StatsPeriodSwitcher from "./components/stats/StatsPeriodSwitcher.vue";
import type { StatsPeriod } from "./components/stats/period";
import { statsQueries } from "@/queries/stats.queries";

const period = ref<StatsPeriod>("month");

// Есть ли история вообще (за всё время) — иначе показываем пустое состояние.
const { data: allTime } = useQuery(statsQueries.summary(undefined));
const hasHistory = computed(() =>
  allTime.value === undefined
  || allTime.value.totalSeconds > 0
  || allTime.value.playsCount > 0,
);
</script>
