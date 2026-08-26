import { computed, type ComputedRef } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { trackChaptersQueries, saveTrackChapters } from "@/queries/trackChapters.queries";
import type { TrackChapterMark } from "@/db/entities";
import type { TrackId } from "@/types/ids";
import { getLogger } from "@/lib/logger";

export function useTrackChapters(trackId: ComputedRef<TrackId>) {
  return useQuery(computed(() => trackChaptersQueries.detail(trackId.value)));
}

export function useSaveTrackChapters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ trackId, chapters }: { trackId: TrackId; chapters: TrackChapterMark[] }) =>
      saveTrackChapters(queryClient, trackId, chapters),
    onError: (error, { trackId }) => {
      getLogger().error(`[Chapters] Saving chapters for ${trackId} failed: ${String(error)}`);
    },
  });
}
