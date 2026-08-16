<template>
  <div class="flex flex-col gap-3">
    <div class="overflow-x-auto">
      <svg
        :width="width"
        :height="height"
        class="block"
        role="img"
        :aria-label="t('common.heatmapAria')"
      >
        <text
          v-for="m in monthLabels"
          :key="m.weekIndex"
          :x="dayLabelWidth + m.weekIndex * cellPitch"
          y="11"
          class="fill-muted-foreground capitalize text-[11px]"
        >{{ m.label }}</text>

        <text
          v-for="label in dayLabels"
          :key="label.text"
          x="0"
          :y="monthLabelHeight + label.dayOfWeek * cellPitch + cellSize + 5"
          class="fill-muted-foreground text-[11px]"
        >{{ label.text }}</text>

        <g :transform="`translate(${dayLabelWidth}, ${monthLabelHeight})`">
          <g
            v-for="(week, weekIndex) in weeks"
            :key="weekIndex"
            :transform="`translate(${weekIndex * cellPitch}, 0)`"
          >
            <rect
              v-for="cell in week"
              :key="cell.date"
              :y="cell.dayOfWeek * cellPitch"
              :width="cellSize"
              :height="cellSize"
              rx="3"
              :fill="cell.seconds > 0 ? 'var(--primary)' : 'var(--border)'"
              :fill-opacity="cell.seconds > 0 ? opacityFor(cell.seconds) : 1"
            >
              <title>{{ formatTooltip(cell) }}</title>
            </rect>
          </g>
        </g>
      </svg>
    </div>

    <div class="flex items-center justify-end gap-1.5 text-xs text-neutral-500">
      <span>{{ t("common.heatmapLess") }}</span>
      <span
        v-for="ratio in [0, 0.25, 0.5, 0.75, 1]"
        :key="ratio"
        class="inline-block rounded-xs"
        :style="{
          width: `${cellSize}px`,
          height: `${cellSize}px`,
          backgroundColor: ratio === 0 ? 'var(--border)' : 'var(--primary)',
          opacity: ratio === 0 ? 1 : Math.max(ratio, 0.2),
        }"
      />
      <span>{{ t("common.heatmapMore") }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DailyActivityPoint } from "@/db/repositories/stats.repository";
import { formatCalendarTooltip } from "@/lib/format/time";
import { useI18n } from "vue-i18n";

const { t, locale } = useI18n();

const props = defineProps<{ data: DailyActivityPoint[] }>();

const cellSize = 11;
const gap = 2;
const cellPitch = cellSize + gap;
const monthLabelHeight = 20;
const dayLabelWidth = 28;

interface Cell extends DailyActivityPoint {
  dayOfWeek: number; // 0 = понедельник ... 6 = воскресенье
}

const maxSeconds = computed(() => Math.max(1, ...props.data.map(d => d.seconds)));

function opacityFor(seconds: number): number {
  return 0.2 + 0.8 * (seconds / maxSeconds.value);
}

// point.date — локальный ключ "YYYY-MM-DD"; T00:00:00 парсится как локальная полночь.
const cells = computed<Cell[]>(() =>
  props.data.map(point => ({
    ...point,
    dayOfWeek: (new Date(`${point.date}T00:00:00`).getDay() + 6) % 7,
  })),
);

const weeks = computed<Cell[][]>(() => {
  const result: Cell[][] = [];
  let current: Cell[] = [];
  for (const cell of cells.value) {
    if (current.length > 0 && cell.dayOfWeek === 0) {
      result.push(current);
      current = [];
    }
    current.push(cell);
  }
  if (current.length > 0) result.push(current);
  return result;
});

const monthLabels = computed(() => {
  const labels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  const formatter = new Intl.DateTimeFormat(locale.value, { month: "short" });
  weeks.value.forEach((week, weekIndex) => {
    const first = week[0];
    if (!first) return;
    const firstDate = new Date(`${first.date}T00:00:00`);
    const month = firstDate.getMonth();
    if (month !== lastMonth) {
      labels.push({ weekIndex, label: formatter.format(firstDate) });
      lastMonth = month;
    }
  });
  return labels;
});

const dayLabels = computed(() => [
  { dayOfWeek: 0, text: t("common.weekdayShort.mon") },
  { dayOfWeek: 2, text: t("common.weekdayShort.wed") },
  { dayOfWeek: 4, text: t("common.weekdayShort.fri") },
]);

const width = computed(() => dayLabelWidth + weeks.value.length * cellPitch);
const height = monthLabelHeight + 7 * cellPitch - gap;

function formatTooltip(cell: Cell): string {
  return formatCalendarTooltip(cell.date, cell.seconds, locale.value, t);
}
</script>
