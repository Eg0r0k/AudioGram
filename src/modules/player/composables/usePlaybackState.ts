import { computed } from "vue";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { isSameQueueSource, type QueueSource } from "@/modules/queue/types";

export function usePlaybackState(source: () => QueueSource) {
  const playerStore = usePlayerStore();
  const queueStore = useQueueStore();

  const isActiveSource = computed(() => {
    const current = queueStore.queue[queueStore.currentIndex.valueOf()]?.source as QueueSource | undefined;
    if (!current) return false;

    return isSameQueueSource(current, source());
  });

  const isPlaying = computed(() => isActiveSource.value && playerStore.isPlaying);
  // Immediate: the pause icon must not flash back to play while a start is
  // still loading. The delayed indicator is for spinners and disabling.
  const isLoading = computed(() => isActiveSource.value && playerStore.isLoading);
  const showLoadingIndicator = computed(() => isActiveSource.value && playerStore.showLoadingIndicator);

  return { isActiveSource, isPlaying, isLoading, showLoadingIndicator };
}
