import { useEventBus } from "@vueuse/core";
import { usePlayerStore } from "./store/player.store";
import { useLyricsStore } from "./store/lyrics.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { isLibraryTrack } from "./types";
import { trackChangedEvent, trackEndedEvent } from "./lib/player-events";
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
  useEventBus(trackChangedEvent).on((track) => {
    useLyricsStore().loadFor(track);

    if (!track || !isLibraryTrack(track)) return;
    statsService.startListening(
      track.id as TrackId,
      track.artistIds[0],
      track.albumId,
      track.duration,
    );
  });

  useEventBus(trackEndedEvent).on(() => {
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

  // The persisted track is rehydrated before any event fires — load its
  // lyrics eagerly so opening the panel shows them without a spinner.
  useLyricsStore().loadFor(usePlayerStore().currentTrack);
}
