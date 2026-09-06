import { useQueryClient } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { getLogger } from "@/lib/logger";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { deleteTracksWithUndo } from "@/queries/track-undo";
import type { TrackId } from "@/types/ids";

export const UNDO_TOAST_MS = 5000;

export const useTrackDeletion = () => {
  const queryClient = useQueryClient();
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const deleteWithUndo = async (ids: TrackId[], message: (deleted: number) => string): Promise<number> => {
    const idSet = new Set<string>(ids);
    const queueItemIds = queueStore.queue
      .filter(item => idSet.has(item.track.id))
      .map(item => item.id);

    const undo = await deleteTracksWithUndo(queryClient, ids);
    if (undo.deleted === 0) return 0;
    if (queueItemIds.length > 0) await queueStore.removeMultiple(queueItemIds);

    let undone = false;
    const finalize = () => {
      if (undone) return;
      undo.finalize().catch((error: unknown) => {
        getLogger().warn(`[Tracks] Finalizing a track deletion failed: ${String(error)}`);
      });
    };

    toast.success(message(undo.deleted), {
      duration: UNDO_TOAST_MS,
      action: {
        label: t("common.undo"),
        onClick: () => {
          undone = true;
          undo.restore().catch((error: unknown) => {
            getLogger().error(`[Tracks] Restoring deleted tracks failed: ${String(error)}`);
            toast.error(t("track.restoreFailed"));
          });
        },
      },
      onAutoClose: finalize,
      onDismiss: finalize,
    });

    return undo.deleted;
  };

  return { deleteWithUndo };
};
