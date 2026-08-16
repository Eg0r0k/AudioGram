<template>
  <Item v-if="peak">
    <ItemContent>
      <ItemTitle>{{ title }}</ItemTitle>
      <ItemSubtitle>
        <svg
          :width="24 * BAR_PITCH"
          :height="CHART_HEIGHT"
          class="mt-1 block"
          role="img"
          :aria-label="title"
        >
          <rect
            v-for="(seconds, hour) in hours"
            :key="hour"
            :x="hour * BAR_PITCH"
            :y="CHART_HEIGHT - barHeight(seconds)"
            :width="BAR_PITCH - 2"
            :height="barHeight(seconds)"
            rx="1"
            :class="seconds > 0 ? 'fill-primary' : 'fill-border'"
          />
        </svg>
      </ItemSubtitle>
    </ItemContent>
  </Item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Item, ItemContent, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useHourlyActivity } from "@/composables/useStatsQueries";

const props = defineProps<{ since?: number }>();

const BAR_PITCH = 8;
const CHART_HEIGHT = 24;
const WINDOW = 4;

const { t } = useI18n();
const { data } = useHourlyActivity(() => props.since);

const hours = computed(() => data.value ?? []);
const maxSeconds = computed(() => Math.max(1, ...hours.value));

function barHeight(seconds: number): number {
  if (seconds <= 0) return 2;
  return Math.max(3, Math.round((seconds / maxSeconds.value) * CHART_HEIGHT));
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
