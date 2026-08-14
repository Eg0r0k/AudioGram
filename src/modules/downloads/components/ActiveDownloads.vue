<template>
  <Item v-if="hasActivity">
    <ItemMedia>
      <IconProgressDown class="size-6 mr-3" />
    </ItemMedia>
    <ItemContent>
      <ItemTitle>{{ $t("downloads.active") }}</ItemTitle>
      <ItemSubtitle>
        <span class="flex flex-col gap-0.5 text-sm text-muted-foreground">
          <span
            v-for="(batch, id) in activeBatches"
            :key="id"
            class="flex items-center gap-2"
          >
            <span>{{ $t("downloads.batch") }}</span>
            <span>{{ $t("downloads.progress", { done: batch.finished + batch.failed, total: batch.total }) }}</span>
            <span
              v-if="batch.failed > 0"
              class="text-destructive"
            >{{ $t("downloads.failedCount", { count: batch.failed }) }}</span>
          </span>
          <span
            v-if="singleCount > 0"
            class="flex items-center gap-2"
          >
            <span>{{ $t("downloads.tracks") }}</span>
            <span>{{ singleCount }}</span>
          </span>
        </span>
      </ItemSubtitle>
    </ItemContent>
  </Item>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Item, ItemContent, ItemMedia, ItemSubtitle, ItemTitle } from "@/components/ui/item";
import IconProgressDown from "~icons/tabler/progress-down";
import { useDownloadsStore, type BatchProgress } from "../store/downloads.store";

//
// Live view of the download queue for the storage settings page. Reads the
// in-memory runtime store only — batches do not survive a restart (v1
// limitation, §9), individual jobs resume and reappear here as "tracks".
//

const store = useDownloadsStore();

/** Fully settled batches stay in the store; only unfinished ones are shown. */
const activeBatches = computed(() => {
  const active: Record<string, BatchProgress> = {};
  for (const [id, batch] of Object.entries(store.batches)) {
    if (batch.finished + batch.failed < batch.total) active[id] = batch;
  }
  return active;
});

/** Jobs queued outside any batch — single-track downloads. */
const singleCount = computed(() =>
  Object.values(store.jobs).filter(job => !job.batchId).length);

const hasActivity = computed(() =>
  Object.keys(activeBatches.value).length > 0 || singleCount.value > 0);
</script>
