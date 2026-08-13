import { queryOptions, skipToken } from "@tanstack/vue-query";
import { offlineCopyRepository } from "@/db/repositories";
import type { OfflineCopyEntity } from "@/db/entities";
import { TrackId } from "@/types/ids";
import { queryKeys } from "./query-keys";
import { unwrapResult } from "./shared";

const NO_TRACK_ID = TrackId("__offline-copy-none__");

export const offlineCopyQueries = {
  /** Pass null to skip (local tracks and ephemeral subjects have no copies). */
  detail: (trackId: TrackId | null) =>
    queryOptions({
      queryKey: queryKeys.offlineCopies.detail(trackId ?? NO_TRACK_ID),
      queryFn: trackId
        ? async (): Promise<OfflineCopyEntity | null> =>
          (await unwrapResult(offlineCopyRepository.findById(trackId))) ?? null
        : skipToken,
    }),
} as const;
