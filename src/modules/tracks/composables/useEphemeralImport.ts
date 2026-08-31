import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { getLogger } from "@/lib/logger";
import type { PlayerTrack } from "@/modules/player/types";
import { mapTrackEntityToPlayerTrack } from "@/modules/player/utils/trackEntity";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { ephemeralFilePath } from "@/modules/tracks/lib/trackPredicates";
import { useImport } from "@/modules/library/composables/useImport";
import { getTrackEntityById } from "@/queries/track.queries";

/**
 * "Import to library" CTA on an open-with ephemeral track (M3): runs the
 * import pipeline, then swaps the queue entries onto the imported library
 * track вЂ” like and history work immediately, playback never restarts.
 */
export function useEphemeralImport(track: MaybeRefOrGetter<PlayerTrack | null>) {
  const { importFromPaths, isRunning } = useImport();
  const queueStore = useQueueStore();

  const importPath = computed(() => ephemeralFilePath(toValue(track)));

  async function importCurrent(): Promise<void> {
    const subject = toValue(track);
    const path = importPath.value;
    if (!subject || !path) return;

    const result = await importFromPaths([path]);
    // Skipped or failed leaves the entry ephemeral вЂ” nothing to swap onto.
    const imported = result?.successful[0];
    if (!imported) return;

    try {
      const entity = await getTrackEntityById(imported.trackId);
      if (entity) {
        queueStore.swapEphemeralForLibrary(subject.id, mapTrackEntityToPlayerTrack(entity));
      }
    }
    catch (error) {
      // The import itself succeeded; a failed swap only postpones the
      // upgrade until the queue is rebuilt from the library.
      getLogger().warn(`[Import] Queue swap failed for ${imported.trackId}: ${String(error)}`);
    }
  }

  return { importPath, isRunning, importCurrent };
}
