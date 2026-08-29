import { useMutation, useQueryClient } from "@tanstack/vue-query";
import type { Track } from "@/modules/player/types";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { toggleTrackLikeAndSync } from "@/queries/track.queries";
import { useQueueStore } from "@/modules/queue/store/queue.store";

export function useToggleTrackLike() {
  const queryClient = useQueryClient();
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const mutation = useMutation({
    mutationFn: async (track: Track) => {
      const nextTrack = await toggleTrackLikeAndSync(queryClient, track);

      track.isLiked = nextTrack.isLiked;

      // The now-playing UI reads the queue's copy of the current track.
      queueStore.syncTrackMetadata(nextTrack);

      return nextTrack;
    },
    onError: () => {
      toast.error(t("track.likeToggleFailed"));
    },
  });

  return {
    toggleTrackLike: mutation.mutateAsync,
    isTogglingLike: mutation.isPending,
  };
}
