<template>
  <SettingsGroup
    v-if="total > 0"
    class="mt-3"
  >
    <Item>
      <ItemMedia>
        <div class="relative size-10 shrink-0">
          <svg
            class="size-10 -rotate-90"
            viewBox="0 0 36 36"
          >
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              class="text-background"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              class="text-primary transition-[stroke-dashoffset] duration-300"
              :stroke-dasharray="`${2 * Math.PI * 15}`"
              :stroke-dashoffset="`${2 * Math.PI * 15 * (1 - percent / 100)}`"
            />
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
            {{ percent }}%
          </span>
        </div>
      </ItemMedia>
      <ItemContent class="ml-3">
        <ItemTitle>{{ $t("settings.stats.completionTitle", { percent }) }}</ItemTitle>
        <ItemSubtitle>
          {{ $t("settings.stats.completionSubtitle", {
            completed: summary?.completedCount ?? 0,
            skipped: summary?.skippedCount ?? 0,
          }) }}
        </ItemSubtitle>
      </ItemContent>
    </Item>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { useStatsSummary } from "@/composables/useStatsQueries";

const props = defineProps<{ since?: number }>();

const { data: summary } = useStatsSummary(() => props.since);

const total = computed(() =>
  (summary.value?.completedCount ?? 0) + (summary.value?.skippedCount ?? 0),
);
const percent = computed(() =>
  total.value === 0 ? 0 : Math.round(((summary.value?.completedCount ?? 0) / total.value) * 100),
);
</script>
