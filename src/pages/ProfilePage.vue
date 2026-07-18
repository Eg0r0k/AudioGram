<template>
  <Scrollable class="flex-1">
    <div class="mx-auto px-4 py-6 lg:px-8 lg:py-10">
      <StatsCard
        title="Активность"
        subtitle="Последние 6 месяцев"
        :icon="IconCalendar"
        class="mb-6"
      >
        <div
          v-if="isDailyLoading"
          class="h-32 animate-pulse rounded-lg bg-white/5"
        />
        <p
          v-else-if="isHeatmapEmpty"
          class="py-8 text-center text-sm text-neutral-500"
        >
          Пока нет истории прослушивания
        </p>
        <CalendarHeatmap
          v-else
          :data="dailyActivity ?? []"
        />
      </StatsCard>



      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StatsCard
          title="Звуковой профиль"
          subtitle="Средние показатели твоих треков"
          :icon="IconMusic"
        >
          <div
            v-if="isSonicLoading"
            class="h-56 animate-pulse rounded-lg bg-white/5"
          />
          <p
            v-else-if="!sonicProfile || sonicProfile.trackCount === 0"
            class="py-8 text-center text-sm text-neutral-500"
          >
            Недостаточно проанализированных треков
          </p>
          <div
            v-else
            class="flex justify-center"
          >
            <SonicProfileRadar :profile="sonicProfile" />
          </div>
        </StatsCard>

        <StatsCard
          title="Топ жанров"
          subtitle="По времени прослушивания"
          :icon="IconTags"
        >
          <div
            v-if="isGenresLoading"
            class="h-40 animate-pulse rounded-lg bg-white/5"
          />
          <p
            v-else-if="!topGenres || topGenres.length === 0"
            class="py-8 text-center text-sm text-neutral-500"
          >
            Добавь теги трекам, чтобы видеть жанры
          </p>
          <TopGenresChart
            v-else
            :data="topGenres"
          />
        </StatsCard>
      </div>
    </div>
  </Scrollable>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import IconCalendar from "~icons/tabler/calendar";
import IconMusic from "~icons/tabler/music";
import IconTags from "~icons/tabler/tags";
import { useDailyActivity, useSonicProfile, useTopGenres } from "@/composables/useStatsQueries";
import CalendarHeatmap from "@/components/ui/charts/CalendarHeatmap.vue";
import StatsCard from "@/components/ui/charts/StatsCard.vue";
import SonicProfileRadar from "@/components/ui/charts/SonicProfileRadar.vue";
import TopGenresChart from "@/components/ui/charts/TopGenresChart.vue";

const { data: dailyActivity, isLoading: isDailyLoading } = useDailyActivity(365);
const { data: sonicProfile, isLoading: isSonicLoading } = useSonicProfile();
const { data: topGenres, isLoading: isGenresLoading } = useTopGenres(8);

const isHeatmapEmpty = computed(() => (dailyActivity.value ?? []).every(d => d.seconds === 0));
</script>
