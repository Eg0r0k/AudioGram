<template>
  <SettingsGroup
    v-if="peak"
    class="mt-3"
  >
    <Item>
      <ItemContent class="min-w-0 flex-1">
        <ItemTitle>{{ title }}</ItemTitle>

        <div
          class="mt-3 flex items-end gap-[3px]"
          :style="{ height: `${CHART_HEIGHT}px` }"
          role="img"
          :aria-label="title"
        >
          <div
            v-for="(seconds, hour) in hours"
            :key="hour"
            class="min-w-0 flex-1 rounded-sm"
            :class="barClass(hour, seconds)"
            :style="{ height: `${barHeight(seconds)}px` }"
          />
        </div>

        <div class="mt-1.5 flex text-[10px] leading-none text-muted-foreground tabular-nums">
          <span class="w-1/4">00</span>
          <span class="w-1/4">06</span>
          <span class="w-1/4">12</span>
          <span class="w-1/4">18</span>
        </div>
      </ItemContent>
    </Item>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useHourlyActivity } from "@/composables/useStatsQueries";

const props = defineProps<{ since?: number }>();

const CHART_HEIGHT = 56;
const WINDOW = 4;

const { t } = useI18n();
const { data } = useHourlyActivity(() => props.since);

const hours = computed(() => data.value ?? []);
const maxSeconds = computed(() => Math.max(1, ...hours.value));

function barHeight(seconds: number): number {
  if (seconds <= 0) return 2;
  return Math.max(4, Math.round((seconds / maxSeconds.value) * CHART_HEIGHT));
}

// Лучшее окно из 4 подряд идущих часов (с переходом через полночь).
const peak = computed(() => {
  const h = hours.value;
  if (h.length !== 24 || h.every(s => s === 0)) return null;
  let bestStart = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += h[(start + i) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }
  return { start: bestStart, end: (bestStart + WINDOW) % 24 };
});

function isPeakHour(hour: number): boolean {
  if (!peak.value) return false;
  return (hour - peak.value.start + 24) % 24 < WINDOW;
}

function barClass(hour: number, seconds: number): string {
  if (seconds <= 0) return "bg-border";
  return isPeakHour(hour) ? "bg-primary" : "bg-primary/35";
}

function hourlyKey(start: number): "hourlyMorning" | "hourlyDay" | "hourlyEvening" | "hourlyNight" {
  if (start >= 5 && start < 11) return "hourlyMorning";
  if (start >= 11 && start < 17) return "hourlyDay";
  if (start >= 17 && start < 23) return "hourlyEvening";
  return "hourlyNight";
}

const title = computed(() => {
  if (!peak.value) return "";
  const { start, end } = peak.value;
  const pad = (n: number) => String(n).padStart(2, "0");
  const range = `${pad(start)}:00–${pad(end)}:00`;
  return t(`settings.stats.${hourlyKey(start)}`, { range });
});
</script>
