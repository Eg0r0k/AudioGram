<template>
  <svg
    :viewBox="`0 0 ${size} ${size}`"
    :width="size"
    :height="size"
    role="img"
    aria-label="Звуковой профиль"
    overflow="visible"
  >
    <g :transform="`translate(${size / 2}, ${size / 2})`">
      <circle
        v-for="ring in rings"
        :key="ring"
        :r="rScale(ring)"
        fill="none"
        stroke="var(--border)"
        stroke-width="1"
      />
      <line
        v-for="axis in axes"
        :key="axis.label"
        x1="0"
        y1="0"
        :x2="rScale(1) * Math.cos(axis.angle - Math.PI / 2)"
        :y2="rScale(1) * Math.sin(axis.angle - Math.PI / 2)"
        stroke="var(--border)"
        stroke-width="1"
      />
      <path
        :d="areaPath"
        :fill="`var(${accentVar})`"
        fill-opacity="0.25"
        :stroke="`var(${accentVar})`"
        stroke-width="1.5"
      />
      <text
        v-for="axis in axes"
        :key="`label-${axis.label}`"
        :x="(rScale(1) + 18) * Math.cos(axis.angle - Math.PI / 2)"
        :y="(rScale(1) + 18) * Math.sin(axis.angle - Math.PI / 2)"
        :text-anchor="axis.textAnchor"
        :dominant-baseline="axis.dominantBaseline"
        class="fill-muted-foreground text-[11px]"
      >{{ axis.label }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import * as d3 from "d3";
import type { SonicProfile } from "@/db/repositories/stats.repository";

const props = withDefaults(defineProps<{ profile: SonicProfile; accentVar?: string }>(), {
  accentVar: "--primary",
});

const size = 220;
const rings = [0.25, 0.5, 0.75, 1];
const rScale = d3.scaleLinear().domain([0, 1]).range([0, size / 2 - 30]);

const normalizedBpm = computed(() => Math.min(1, Math.max(0, (props.profile.avgBpm - 60) / 120)));

const axes = computed(() => {
  const values = [
    { label: "Энергия", value: props.profile.avgEnergy },
    { label: "Танцевальность", value: props.profile.avgDanceability },
    { label: "Темп", value: normalizedBpm.value },
    { label: "Мажор", value: props.profile.majorRatio },
  ];

  return values.map((v, i) => {
    const angle = (i / values.length) * Math.PI * 2;
    const actualAngle = angle - Math.PI / 2;
    const cosA = Math.cos(actualAngle);
    const sinA = Math.sin(actualAngle);

    let textAnchor = "middle";
    if (cosA > 0.1) textAnchor = "start";
    else if (cosA < -0.1) textAnchor = "end";
    let dominantBaseline = "middle";
    if (sinA > 0.1) dominantBaseline = "hanging";
    else if (sinA < -0.1) dominantBaseline = "auto";

    return { ...v, angle, textAnchor, dominantBaseline };
  });
});

const radialLine = d3
  .lineRadial<{ angle: number; value: number }>()
  .angle(d => d.angle)
  .radius(d => rScale(d.value))
  .curve(d3.curveLinearClosed);

const areaPath = computed(() => radialLine(axes.value) ?? "");
</script>
