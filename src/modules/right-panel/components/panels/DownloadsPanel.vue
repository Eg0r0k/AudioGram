<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <RightPanelHeader
      :show-close="true"
      :title="t('downloads.queueTitle')"
      @close="rightPanel.close()"
    />

    <Scrollable class="min-h-0 flex-1">
      <Empty
        v-if="jobs.length === 0"
        class="p-6 py-12 md:p-6 md:py-12"
      >
        <EmptyDescription>{{ t("downloads.empty") }}</EmptyDescription>
      </Empty>

      <ItemGroup
        v-else
        class="gap-1 px-3 pb-4"
      >
        <Item
          v-for="job in jobs"
          :key="job.jobId"
          class="gap-3 rounded-lg px-2 py-2"
        >
          <ItemMedia>
            <IconLoader
              v-if="job.status === 'running'"
              class="size-5 animate-spin text-primary"
            />
            <IconClock
              v-else
              class="size-5 text-muted-foreground"
            />
          </ItemMedia>

          <ItemContent class="min-w-0">
            <ItemTitle class="w-full text-sm font-normal">
              <span class="min-w-0 truncate">{{ titleOf(job.trackId) }}</span>
            </ItemTitle>
            <ItemSubtitle class="text-xs">
              <template v-if="job.cancelling">
                {{ t("downloads.cancelling") }}
              </template>
              <template v-else-if="job.status === 'running' && job.total">
                {{ Math.min(100, Math.round((job.downloaded / job.total) * 100)) }}%
              </template>
              <template v-else-if="job.status === 'running'">
                {{ t("downloads.downloading") }}
              </template>
              <template v-else>
                {{ t("downloads.queued") }}
              </template>
            </ItemSubtitle>
          </ItemContent>

          <ItemActions class="pointer-events-auto">
            <Button
              variant="ghost"
              size="icon-sm"
              class="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              :disabled="job.cancelling"
              :aria-label="t('common.cancel')"
              @click="cancelTrackDownload(job.jobId)"
            >
              <IconX class="size-4.5" />
            </Button>
          </ItemActions>
        </Item>
      </ItemGroup>
    </Scrollable>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import { useQuery } from "@tanstack/vue-query";
import { Button } from "@/components/ui/button";
import { Scrollable } from "@/components/ui/scrollable";
import RightPanelHeader from "@/modules/right-panel/components/RightPanelHeader.vue";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import { cancelTrackDownload } from "@/modules/downloads/service/manager";
import { getTracksByIds } from "@/queries/track.queries";
import type { TrackId } from "@/types/ids";
import IconLoader from "~icons/tabler/loader-2";
import IconClock from "~icons/tabler/clock";
import IconX from "~icons/tabler/x";

//
// Live download queue: runtime jobs from the downloads store, titles from
// the pinned track rows (downloads always pin first, so the rows exist).
//

const { t } = useI18n();
const rightPanel = useRightPanelStore();
const downloads = useDownloadsStore();

const jobs = computed(() => Object.values(downloads.jobs));

const trackIds = computed(() => jobs.value.map(job => job.trackId));

const { data: titleRows } = useQuery(computed(() => ({
  queryKey: ["downloads", "panel-titles", trackIds.value] as const,
  queryFn: () => getTracksByIds(trackIds.value),
  enabled: trackIds.value.length > 0,
})));

const titles = computed(() => {
  const map = new Map<TrackId, string>();
  for (const row of titleRows.value ?? []) map.set(row.id, row.title);
  return map;
});

function titleOf(trackId: TrackId): string {
  return titles.value.get(trackId) ?? trackId;
}
</script>
