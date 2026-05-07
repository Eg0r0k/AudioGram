import { getSecureRandomIndex } from "@/lib/random";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { isSameQueueSource, type QueueSource } from "@/modules/queue/types";
import type { PlayerTrack } from "@/modules/player/types";

export function useQueueShuffle() {
  const queueStore = useQueueStore();

  return async function shuffleQueue(
    source: QueueSource,
    loadTracks: () => Promise<PlayerTrack[]>,
  ) {
    if (queueStore.currentItem && isSameQueueSource(queueStore.currentItem.source, source)) {
      queueStore.toggleShuffle();
      return;
    }

    const tracks = await loadTracks();
    if (tracks.length === 0) return;

    const randomIndex = getSecureRandomIndex(tracks.length);
    await queueStore.setQueue(tracks, randomIndex, source, { shuffled: true });
  };
}
