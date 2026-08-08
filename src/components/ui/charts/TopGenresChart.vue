<template>
  <div class="flex items-center gap-6">
    <svg
      :width="size"
      :height="size"
      role="img"
      aria-label="Топ жанров по времени прослушивания"
    >
      <g :transform="`translate(${size / 2}, ${size / 2})`">
        <path
          v-for="slice in slices"
          :key="slice.data.id"
          :d="arcGen(slice) ?? undefined"
          :fill="`var(${slice.colorVar})`"
        >
          <title>{{ slice.data.name }}: {{ formatMinutes(slice.data.secondsListened) }}</title>
        </path>
      </g>
    </svg>

    <ul class="flex flex-col gap-2">
      <li
        v-for="slice in slices"
        :key="slice.data.id"
        class="flex items-center gap-2 text-sm"
      >
        <span
          class="h-2.5 w-2.5 rounded-full"
          :style="{ backgroundColor: `var(${slice.colorVar})` }"
        />
        <span class="text-foreground">{{ slice.data.name }}</span>
        <span class="text-muted-foreground">{{ formatMinutes(slice.data.secondsListened) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import * as d3 from "d3";
import type { TopGenreEntry } from "@/db/repositories/stats.repository";

const props = defineProps<{ data: TopGenreEntry[] }>();

const size = 160;

const CHART_COLORS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--muted",
];

const MAX_SLICES = 6;

const grouped = computed<TopGenreEntry[]>(() => {
  if (props.data.length <= MAX_SLICES) return props.data;
  const top = props.data.slice(0, MAX_SLICES - 1);
  const rest = props.data.slice(MAX_SLICES - 1);
  const restTotal = rest.reduce(
    (acc, g) => ({ id: "other" as const, name: "Остальное", count: acc.count + g.count, secondsListened: acc.secondsListened + g.secondsListened }),
    { id: "other" as const, name: "Остальное", count: 0, secondsListened: 0 },
  );
  return [...top, restTotal];
});

const pieGen = d3.pie<TopGenreEntry>().value(d => d.secondsListened).sort(null);
const arcGen = d3.arc<d3.PieArcDatum<TopGenreEntry>>().innerRadius(size / 2 - 24).outerRadius(size / 2);

const slices = computed(() => pieGen(grouped.value).map((slice, i) => ({
  ...slice,
  colorVar: CHART_COLORS[i % CHART_COLORS.length],
})));

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)} мин`;
}
</script>
