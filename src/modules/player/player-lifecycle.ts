import { usePlayerStore } from "./store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { isLibraryTrack } from "./types";
import { playerEvents } from "./lib/player-events";
import { statsService } from "@/services/stats.service";
import { getLogger } from "@/lib/logger";
import type { TrackId } from "@/types/ids";

/**
 * Cross-domain reactions to player lifecycle events, in one place and in an
 * explicit order. Stores stay passive state holders; anything that must
 * happen when a track starts or ends is choreographed here instead of
 * scattered watchers whose relative order Vue does not define.
 *
 * Called once from main.ts after Pinia is installed. Stores are resolved
 * lazily inside handlers so registration itself instantiates nothing.
 */
export function initPlayerLifecycle(): void {
  playerEvents.on("trackChanged", (track) => {
    if (!track || !isLibraryTrack(track)) return;
    statsService.startListening(
      track.id as TrackId,
      track.artistIds[0],
      track.albumId,
      track.duration,
    );
  });

  playerEvents.on("trackEnded", () => {
    const player = usePlayerStore();

    if (isLibraryTrack(player.currentTrack)) {
      statsService.stopListening(player.currentTime, true)
        .catch(err => getLogger().error(`[Stats] ${String(err)}`));
    }

    // "Sleep after current track" (wip): the flag is consumed here; turning
    // consumption into pause-instead-of-advance is the feature's next step.
    if (player.sleepAfterCurrentTrack) {
      player.sleepAfterCurrentTrack = false;
    }

    useQueueStore().next();
  });
}
