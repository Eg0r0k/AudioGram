import type { PlayerTrack } from "@/modules/player/types";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { getLogger } from "@/lib/logger";

/**
 * Tracks queued straight from live browsing (a remote page's DTO) shadow-pin
 * their rows, so the persisted snapshot — which stores library entries by
 * id only — can restore them next session. Idempotent upserts,
 * fire-and-forget; a failure only means that entry will drop out of the
 * restored queue.
 */
export const shadowPinRemoteTracks = (tracks: readonly PlayerTrack[]): void => {
  for (const track of tracks) {
    if (track.kind !== "library" || !track.sourceDto) continue;
    ensurePinned({ kind: "remote", dto: track.sourceDto }, { pinned: 0 }).catch((error) => {
      getLogger().warn(`[Queue] Shadow-pin failed for ${track.id}: ${String(error)}`);
    });
  }
};
