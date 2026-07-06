import { queryOptions, type QueryClient } from "@tanstack/vue-query";
import { trackChaptersRepository } from "@/db/repositories/trackChapters.repository";
import type { TrackChapterMark } from "@/db/entities";
import { queryKeys } from "@/queries/query-keys";
import { unwrapResult } from "./shared";
import type { TrackId } from "@/types/ids";

export const trackChaptersQueries = {
  detail: (trackId: TrackId) =>
    queryOptions({
      queryKey: queryKeys.trackChapters.detail(trackId),
      queryFn: async (): Promise<TrackChapterMark[]> => {
        const entity = await unwrapResult(trackChaptersRepository.findById(trackId));
        return entity?.chapters ?? [];
      },
      staleTime: Infinity,
    }),
} as const;

export async function saveTrackChapters(
  queryClient: QueryClient,
  trackId: TrackId,
  chapters: TrackChapterMark[],
): Promise<void> {
  const clean = chapters.map(c => ({
    time: c.time,
    ...(c.title !== undefined ? { title: c.title } : {}),
  }));
  await unwrapResult(trackChaptersRepository.setForTrack(trackId, clean));
  queryClient.setQueryData(queryKeys.trackChapters.detail(trackId), clean);
}
