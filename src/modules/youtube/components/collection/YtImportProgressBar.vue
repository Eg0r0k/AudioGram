<template>
  <div
    v-if="isRunning"
    class="flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur"
  >
    <IconLoader class="size-4.5 shrink-0 animate-spin text-primary" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-xs font-medium">
        {{ currentTitle }}
      </p>
      <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full bg-primary transition-[width] duration-300"
          :style="{ width: `${overallPercent}%` }"
        />
      </div>
    </div>
    <span class="shrink-0 text-xs text-muted-foreground">
      {{ $t("youtube.import.progress", { current: finishedCount, total: state.items.length }) }}
    </span>
    <Button
      variant="ghost"
      size="sm"
      class="shrink-0 rounded-full text-xs"
      :disabled="state.status === 'cancelling'"
      @click="cancel"
    >
      {{ $t("youtube.import.cancel") }}
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { Button } from "@/components/ui/button";
import { useYtBatchImport } from "../../composables/useYtBatchImport";
import IconLoader from "~icons/tabler/loader-2";

const { state, isRunning, finishedCount, cancel } = useYtBatchImport();

const currentTitle = computed(
  () => state.value.items[state.value.currentIndex]?.title ?? state.value.playlistName,
);

const overallPercent = computed(() => {
  const total = state.value.items.length;
  if (total === 0) return 0;
  return Math.round((finishedCount.value / total) * 100);
});
</script>
