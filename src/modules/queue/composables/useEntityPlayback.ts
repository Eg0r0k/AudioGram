import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Track } from "@/modules/player/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { useQueueShuffle } from "@/modules/queue/composables/useQueueShuffle";
import type { QueueSource } from "@/modules/queue/types";
import { getLogger } from "@/lib/logger";

//
// Play / play-one / shuffle for an entity page (album, artist, playlist).
//
// Every such page renders a list that may be only part of the entity — the
// Dexie path pages its tracks 50 at a time — so queueing what is on screen
// would silently drop the tail. `isComplete` is what says otherwise, and it
// is a property of the DATA PATH, not of the id: a downloaded remote album
// carries an "nd:"/"yt:" id and still pages out of Dexie like any other
// library row.
//

export interface EntityPlaybackOptions {
  /** The rows currently rendered. */
  tracks: MaybeRefOrGetter<Track[]>;
  /** Where to record the queue as coming from; null while unknown. */
  source: MaybeRefOrGetter<QueueSource | null>;
  /** True when `tracks` already holds the entity whole. */
  isComplete: MaybeRefOrGetter<boolean>;
  /** The full list in the page's current sort order, for when it does not. */
  loadAll: () => Promise<Track[]>;
}

export const useEntityPlayback = (options: EntityPlaybackOptions) => {
  const queueStore = useQueueStore();
  const playerStore = usePlayerStore();
  const shuffleQueue = useQueueShuffle();

  const currentTrackId = computed(() => playerStore.currentTrack?.id ?? null);

  /** The whole entity, straight off the page when the page already has it. */
  const allTracks = async (): Promise<Track[]> =>
    (toValue(options.isComplete) ? [...toValue(options.tracks)] : await options.loadAll());

  const playAll = async () => {
    const source = toValue(options.source);
    if (!source) return;

    const tracks = await allTracks();
    if (tracks.length === 0) return;
    await queueStore.setQueue(tracks, 0, source);
  };

  const playTrack = async (index: number) => {
    const rows = toValue(options.tracks);
    const selected = index >= 0 && index < rows.length ? rows[index] : undefined;
    if (!selected) return;

    if (currentTrackId.value === selected.id) {
      playerStore.togglePlay()
        .catch(error => getLogger().error(`[Player] Toggling playback failed: ${String(error)}`));
      return;
    }

    const source = toValue(options.source);
    if (!source) return;

    // A complete list is the one on screen, so the row's index IS its queue
    // position — no id lookup, which would pick the wrong one of a repeated
    // track. Only a partial list has to find the row in the full one.
    if (toValue(options.isComplete)) {
      await queueStore.setQueue([...toValue(options.tracks)], index, source);
      return;
    }

    const tracks = await options.loadAll();
    const fullIndex = tracks.findIndex(track => track.id === selected.id);
    if (fullIndex === -1) return;

    await queueStore.setQueue(tracks, fullIndex, source);
  };

  const shuffle = async () => {
    const source = toValue(options.source);
    if (!source) return;
    if (toValue(options.isComplete) && toValue(options.tracks).length === 0) return;

    await shuffleQueue(source, allTracks);
  };

  const addToQueue = () => {
    const tracks = toValue(options.tracks);
    if (tracks.length === 0) return;
    queueStore.addMultipleToQueue(tracks);
  };

  return { playAll, playTrack, shuffle, addToQueue };
};
