import { until, useEventBus } from "@vueuse/core";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import { TrackSource } from "@/db/entities";
import { StorageErrorCode } from "@/db/errors/storage.errors";
import { usePlayerStore } from "./store/player.store";
import { useLyricsStore } from "./store/lyrics.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { playbackStalledEvent, trackSkippedEvent } from "@/modules/queue/lib/queue-events";
import { isLibraryTrack } from "./types";
import { trackChangedEvent, trackEndedEvent } from "./lib/player-events";
import { initNextTrackPrefetch } from "./service/prefetch-next";
import { statsService } from "@/services/stats.service";
import { getLogger } from "@/lib/logger";

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
    useLyricsStore().loadFor(track)
      .catch(error => getLogger().error(`[Lyrics] Loading lyrics failed: ${String(error)}`));

    if (!track || !isLibraryTrack(track)) return;
    statsService.startListening(
      track.id,
      track.artistIds[0],
      track.albumId,
      track.duration,
    );
  });

  useEventBus(trackEndedEvent).on(() => {
    const player = usePlayerStore();

    if (isLibraryTrack(player.currentTrack)) {
      statsService.stopListening(player.getListenedSeconds(), { completed: true })
        .catch(err => getLogger().error(`[Stats] ${String(err)}`));
    }

    if (player.sleepAfterCurrentTrack) {
      player.sleepAfterCurrentTrack = false;
    }

    // Detached on purpose: the bus handler is synchronous. advance() knows it
    // may finish late and bails when the user has claimed playback meanwhile.
    useQueueStore().advance()
      .catch(error => getLogger().error(`[Queue] Advancing after the track ended failed: ${String(error)}`));
  });

  // The queue decides whether to skip or stop; what the user sees is decided
  // here. A watched-folder file that vanished gets a pointer to the fix;
  // any other storage failure is skipped quietly (the queue logged it).
  useEventBus(trackSkippedEvent).on(({ track, error }) => {
    if (error.kind === "storage") {
      if (isLibraryTrack(track)
        && track.source === TrackSource.LOCAL_EXTERNAL
        && error.cause.code === StorageErrorCode.FILE_NOT_FOUND) {
        toast.warning(i18n.global.t("watchedFolders.trackPathMissing"));
      }
      return;
    }
    toast.warning(i18n.global.t("queue.trackSkipped", { title: track.title }));
  });

  useEventBus(playbackStalledEvent).on(({ failures }) => {
    toast.error(i18n.global.t("queue.playbackStalled", { count: failures }));
  });

  // The persisted queue restores asynchronously and no event announces it —
  // once it yields a current track, load its lyrics eagerly so opening the
  // panel shows them without a spinner. A play() that lands first loads them
  // through trackChanged, so an already-started player is left alone. The
  // prefetch watcher observes queue/repeat state directly (not events), so
  // it also warms the restored queue and reacts to reorders and mode changes.
  until(() => usePlayerStore().currentTrack).toBeTruthy()
    .then(async (track) => {
      if (usePlayerStore().status === "idle") await useLyricsStore().loadFor(track);
    })
    .catch(error => getLogger().error(`[Lyrics] Loading lyrics for the restored track failed: ${String(error)}`));
  initNextTrackPrefetch();
}
