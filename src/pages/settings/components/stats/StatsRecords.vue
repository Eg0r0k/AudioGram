<template>
  <SettingsGroup
    v-if="records && (records.busiestDay || records.mostRepeatedTrackId)"
    class="mt-3"
  >
    <div class="px-4 py-3 text-primary font-medium">
      {{ $t("settings.stats.records") }}
    </div>

    <Item v-if="records.busiestDay">
      <ItemMedia>
        <IconCalendar class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordBusiestDay") }}</ItemTitle>
        <ItemSubtitle>
          {{ busiestDayLabel }} · {{ formatTotalDuration(records.busiestDay.seconds, t) }}
        </ItemSubtitle>
      </ItemContent>
    </Item>

    <Item v-if="repeatTrack">
      <ItemMedia>
        <IconRepeat class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordOnRepeat") }}</ItemTitle>
        <ItemSubtitle>
          {{ repeatTrack.title }} — {{ repeatTrack.artistName }}
          · {{ $t("settings.stats.playsCount", records.mostRepeatedCount) }}
        </ItemSubtitle>
      </ItemContent>
    </Item>

    <Item v-if="records.longestSessionSeconds > 0">
      <ItemMedia>
        <IconClock class="size-6 mr-3" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{{ $t("settings.stats.recordLongestSession") }}</ItemTitle>
        <ItemSubtitle>{{ formatTotalDuration(records.longestSessionSeconds, t) }}</ItemSubtitle>
      </ItemContent>
    </Item>
  </SettingsGroup>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useQuery } from "@tanstack/vue-query";
import SettingsGroup from "@/modules/settings/components/SettingsGroup.vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useStatsRecords } from "@/composables/useStatsQueries";
import { statsQueries } from "@/queries/stats.queries";
import { formatTotalDuration } from "@/lib/format/time";
import IconCalendar from "~icons/tabler/calendar";
import IconRepeat from "~icons/tabler/repeat";
import IconClock from "~icons/tabler/clock";

const props = defineProps<{ since?: number }>();

const { t, locale } = useI18n();
const { data: records } = useStatsRecords(() => props.since);

const repeatIds = computed(() =>
  records.value?.mostRepeatedTrackId ? [records.value.mostRepeatedTrackId] : [],
);
const { data: repeatTracks } = useQuery(
  computed(() => ({
    ...statsQueries.topTracksMeta(repeatIds.value),
    enabled: repeatIds.value.length > 0,
  })),
);
const repeatTrack = computed(() => repeatTracks.value?.[0] ?? null);

const busiestDayLabel = computed(() => {
  const day = records.value?.busiestDay;
  if (!day) return "";
  // day.date — локальный ключ "YYYY-MM-DD"; T00:00:00 парсится как локальная полночь.
  return new Intl.DateTimeFormat(locale.value, { day: "numeric", month: "long" })
    .format(new Date(`${day.date}T00:00:00`));
});
</script>
