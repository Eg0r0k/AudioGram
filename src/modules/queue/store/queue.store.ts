import { defineStore } from "pinia";
import { computed, markRaw, ref, shallowRef } from "vue";
import { useEventBus } from "@vueuse/core";
import { ok, err, type Result } from "neverthrow";
import { checkPlayable, toPlaybackFailure, type PlaybackError } from "@/modules/player/service/playback-resolver.service";
import { QueueItemId } from "@/types/ids";
import {
  isEphemeralTrack,
  type PlayerTrack,
  REPEAT_MODES,
  type RepeatMode,
} from "@/modules/player/types";
import { isSameQueueSource, type QueueItem, type QueueSource, type QueueState } from "../types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { getLogger } from "@/lib/logger";
import { createDebouncedLocalStorage } from "@/lib/storage/debounced-storage";
import { buildPlaybackQueue, getItemsByOrder, moveItem } from "../lib/queue-order";
import { playbackStalledEvent, trackSkippedEvent } from "../lib/queue-events";
import {
  QUEUE_STORAGE_KEY,
  buildPersistedQueueSnapshot,
  readLegacyRepeatMode,
  rehydratePersistedQueue,
  type PersistedQueueSnapshot,
} from "../service/queue-persistence";
import { createAutoplayRecommender } from "../lib/queue-autoplay";
import { shadowPinRemoteTracks } from "../lib/shadow-pin";

const RESTART_THRESHOLD = 3;
// Transient failures in a row that mean the environment is broken, not the
// tracks: stop there instead of burning through the whole queue while the
// network is down.
const MAX_CONSECUTIVE_TRANSIENT_FAILURES = 3;
// Skips of any kind within one advance before the queue gives up: a folder
// of vanished files would otherwise be walked entry by entry, each one a
// commit, a lyrics load, a stats event and a toast.
const MAX_CONSECUTIVE_SKIPS = 10;

const EMPTY_STATE: QueueState = { items: [], playbackOrder: null, currentItemId: null };

const insertAt = <T>(list: readonly T[], index: number, ...values: T[]): T[] => [
  ...list.slice(0, index),
  ...values,
  ...list.slice(index),
];

// Dev-only: the canonical state is small enough to check exhaustively after
// every commit, and a broken permutation would otherwise surface as a
// silently shorter queue.
const assertQueueInvariants = (state: QueueState) => {
  if (!import.meta.env.DEV) return;
  const order = state.playbackOrder;
  if (order) {
    const ids = new Set(state.items.map(item => item.id));
    const isPermutation = order.length === ids.size
      && new Set(order).size === order.length
      && order.every(id => ids.has(id));
    if (!isPermutation) {
      throw new Error("[Queue] invariant violated: playbackOrder is not a permutation of items");
    }
  }
  if (state.currentItemId !== null && !state.items.some(item => item.id === state.currentItemId)) {
    throw new Error("[Queue] invariant violated: currentItemId points at no item");
  }
};

export const useQueueStore = defineStore("queue", () => {
  // The player store is resolved inside the functions that drive it, never
  // at setup: this store is created during app bootstrap, before the player
  // has any reason to exist.

  // One shallow ref rather than three: a mutation that touches several
  // fields lands atomically, so no reader (and no invariant check) ever
  // sees items from one state and an order from another. Shallow because
  // items are never edited in place — every change is a new array — and
  // deep-proxying a thousand queue entries is pure overhead.
  const state = shallowRef<QueueState>(EMPTY_STATE);
  // Shallow and raw for the same reason as `state`: the persist plugin (and
  // devtools) deep-walk the store state on every mutation, and a reactive
  // snapshot costs a proxy trap per field of every entry on that walk and
  // again in JSON.stringify — 60 ms+ per skip on a 2000-entry queue. Only
  // the ref itself is a dependency; the object is replaced whole on commit.
  const persistedSnapshot = shallowRef<PersistedQueueSnapshot | null>(null);
  const trackSkippedBus = useEventBus(trackSkippedEvent);
  const playbackStalledBus = useEventBus(playbackStalledEvent);
  let _transientFailures = 0;
  // What happens after a track ends — loop it, loop the queue, or stop — is
  // a queue decision, not an engine one.
  const repeatMode = ref<RepeatMode>("off");

  // Bumped by every commit. restorePersistedQueue captures it before its
  // async DB read and refuses to commit when the user acted in that gap
  // (open-with launch, an early click) — their state wins over yesterday's.
  let _mutationEpoch = 0;

  // Bumped every time an entry claims playback. A detached advance() compares
  // it across its await to tell "nothing happened while I was waiting" from
  // "something else took over" — including a replay of the very same entry,
  // which currentItemId alone cannot distinguish.
  let _playbackClaim = 0;

  const items = computed(() => state.value.items);
  const playbackOrder = computed(() => state.value.playbackOrder);
  const currentItemId = computed(() => state.value.currentItemId);

  const originalQueue = computed<QueueItem[]>(() => items.value as QueueItem[]);

  const queue = computed<QueueItem[]>(() => (playbackOrder.value
    ? getItemsByOrder(items.value, playbackOrder.value)
    : items.value) as QueueItem[]);

  const isShuffled = computed(() => playbackOrder.value !== null);

  const currentIndex = computed(() => {
    if (currentItemId.value === null) return -1;
    return queue.value.findIndex(item => item.id === currentItemId.value);
  });

  const currentItem = computed<QueueItem | null>(() => {
    const idx = currentIndex.value;
    return idx >= 0 ? queue.value[idx] : null;
  });

  const currentTrack = computed<PlayerTrack | null>(
    () => currentItem.value?.track ?? null,
  );

  const hasNext = computed(() => {
    if (queue.value.length === 0) return false;
    if (repeatMode.value !== "off") return true;
    return currentIndex.value < queue.value.length - 1;
  });

  const hasPrevious = computed(() => {
    if (queue.value.length === 0) return false;
    if (repeatMode.value === "all") return true;
    return currentIndex.value > 0;
  });

  const isEmpty = computed(() => queue.value.length === 0);

  const size = computed(() => queue.value.length);

  const upcomingItems = computed<QueueItem[]>(() => {
    if (currentIndex.value < 0) return queue.value;
    return queue.value.slice(currentIndex.value + 1);
  });

  const previousItems = computed<QueueItem[]>(() => {
    if (currentIndex.value <= 0) return [];
    return queue.value.slice(0, currentIndex.value);
  });

  function createItem(track: PlayerTrack, source: QueueSource, cover?: string | null): QueueItem {
    return {
      id: QueueItemId(crypto.randomUUID()),
      track,
      source,
      addedAt: Date.now(),
      cover,
    };
  }

  function patchQueueItem(
    list: readonly QueueItem[],
    nextTrack: PlayerTrack,
  ): readonly QueueItem[] {
    const index = list.findIndex(item => item.track.id === nextTrack.id);
    if (index === -1) return list;

    const current = list[index];
    const nextList = list.slice();
    nextList[index] = {
      ...current,
      track: {
        ...current.track,
        ...nextTrack,
      },
    };

    return nextList;
  }

  function getTrackQueueKey(track: PlayerTrack): string {
    return `${track.kind}:${track.id}`;
  }

  /**
   * The single writer. Every mutation lands here, so the epoch, the
   * invariant check and the persisted snapshot can never be forgotten by a
   * new code path (the old mark-mutation / sync-snapshot pair had to be
   * called by hand in every function, and shuffle() already missed one).
   * A `watch` on the state could do the same, but an explicit call is
   * synchronous by construction and lets the one caller that must NOT touch
   * the stored snapshot — a failed restore — say so. Cost per commit is one
   * snapshot build plus the invariant check: 0.5–1.0 ms per mutation on a
   * 1000-item queue (vitest/happy-dom, add/move/insert/remove, shuffled and
   * not), far under the 5 ms budget, so there is nothing to batch.
   */
  const commit = (patch: Partial<QueueState>, options: { persist?: boolean } = {}) => {
    const next = { ...state.value, ...patch };
    assertQueueInvariants(next);
    state.value = next;
    _mutationEpoch++;
    if (options.persist !== false) {
      const snapshot = buildPersistedQueueSnapshot({
        queue: queue.value,
        items: items.value,
        currentItemId: currentItemId.value,
        isShuffled: isShuffled.value,
      });
      persistedSnapshot.value = snapshot ? markRaw(snapshot) : null;
    }
  };

  /**
   * Replace the whole canonical state at once — a restored snapshot, or a
   * test seeding a scenario. Goes through the same invariant check and
   * persistence as every other mutation.
   */
  function hydrate(state: QueueState): void {
    commit(state);
  }

  function syncTrackMetadata(nextTrack: PlayerTrack): void {
    if (isEphemeralTrack(nextTrack)) return;

    commit({ items: patchQueueItem(items.value, nextTrack) });

    // The player shows what it was handed; an edit to the playing track is
    // handed over again so the now-playing UI picks it up.
    const current = currentItem.value;
    if (current && current.track.kind === nextTrack.kind && current.track.id === nextTrack.id) {
      usePlayerStore().presentTrack(current.track);
    }
  }

  /**
   * Import-from-player (M3): every queue entry holding the ephemeral track
   * becomes the freshly imported library track — item identity (id, source,
   * addedAt) survives. If the current entry swaps, the player is told the
   * media it holds now belongs to the library track; the audio element keeps
   * playing the already-loaded file, so playback never restarts.
   */
  function swapEphemeralForLibrary(ephemeralTrackId: string, libraryTrack: PlayerTrack): void {
    const swappedCurrent = items.value.some(item => item.id === currentItemId.value
      && isEphemeralTrack(item.track) && item.track.id === ephemeralTrackId);

    commit({
      items: items.value.map((item) => {
        if (!isEphemeralTrack(item.track) || item.track.id !== ephemeralTrackId) return item;
        return { ...item, track: libraryTrack };
      }),
    });

    if (swappedCurrent) {
      usePlayerStore().presentTrack(libraryTrack);
    }
  }

  function createQueueItems(tracks: PlayerTrack[], source: QueueSource): QueueItem[] {
    const canReuseExistingItems = currentItem.value !== null
      && isSameQueueSource(currentItem.value.source, source);

    if (!canReuseExistingItems) {
      return tracks.map(track => createItem(track, source));
    }

    const reusableItems = new Map<string, QueueItem[]>();

    for (const item of queue.value) {
      if (!isSameQueueSource(item.source, source)) continue;

      const key = getTrackQueueKey(item.track);
      const bucket = reusableItems.get(key);

      if (bucket) {
        bucket.push(item);
      }
      else {
        reusableItems.set(key, [item]);
      }
    }

    return tracks.map((track) => {
      const key = getTrackQueueKey(track);
      const reusableItem = reusableItems.get(key)?.shift();

      if (!reusableItem) {
        return createItem(track, source);
      }

      return {
        ...reusableItem,
        track,
        source,
      };
    });
  }

  function resetPlaybackSelection(): void {
    commit({ currentItemId: null });
    const player = usePlayerStore();
    player.stop();
    player.clearCurrentTrack();
  }

  const itemAt = (index: number): QueueItem | undefined =>
    (index >= 0 && index < queue.value.length ? queue.value[index] : undefined);

  async function playAtIndex(index: number): Promise<Result<void, PlaybackError>> {
    const item = itemAt(index);
    if (!item) return err({ kind: "unavailable", reason: `no queue entry at index ${index}` });

    commit({ currentItemId: item.id });
    _playbackClaim++;

    try {
      await usePlayerStore().playPlayerTrack(item.track);
      _transientFailures = 0;
      return ok(undefined);
    }
    catch (thrown) {
      const { error } = toPlaybackFailure(thrown, item.track);
      getLogger().error(`[Queue] Failed to play "${item.track.title}" (${error.kind}): ${String(thrown)}`);
      return err(error);
    }
  }

  /**
   * What the queue does about an entry that failed, by kind. Returns false
   * when the queue must stop advancing. Every kind is already logged by
   * playAtIndex; what the user gets to see is decided by the subscribers of
   * the events (player-lifecycle.ts).
   */
  const reactToFailure = (track: PlayerTrack, error: PlaybackError): boolean => {
    switch (error.kind) {
      case "broken":
        // Known bad and flagged as such in the library: nothing to say.
        return true;
      case "storage":
      case "unavailable":
        trackSkippedBus.emit({ track, error });
        return true;
      case "source":
      case "timeout":
      case "engine":
        _transientFailures++;
        trackSkippedBus.emit({ track, error });
        if (_transientFailures >= MAX_CONSECUTIVE_TRANSIENT_FAILURES) {
          playbackStalledBus.emit({ track, error, failures: _transientFailures });
          _transientFailures = 0;
          return false;
        }
        return true;
    }
  };

  /** Plays one entry; a failure is reported but the queue stays where it is. */
  async function playSingle(index: number): Promise<void> {
    const item = itemAt(index);
    if (!item) return;
    const result = await playAtIndex(index);
    if (result.isErr()) reactToFailure(item.track, result.error);
  }

  /**
   * Plays the entry at `startIndex`, moving forward past entries that fail
   * (wrapping to the head under repeat-all) until one plays, the attempts
   * run out, a run of transient failures says the environment is down, or
   * too many entries in a row were skipped. An entry known to be unplayable
   * up front is passed over without ever being selected.
   */
  async function playFrom(startIndex: number, maxAttempts: number = queue.value.length): Promise<void> {
    let index = startIndex;
    let skipped = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (index >= queue.value.length) {
        if (repeatMode.value !== "all") break;
        index = 0;
      }
      const item = itemAt(index);
      if (!item) break;

      const playable = checkPlayable(item.track);
      const result = playable.isErr() ? playable : await playAtIndex(index);
      if (result.isOk()) return;
      if (!reactToFailure(item.track, result.error)) break;
      if (++skipped >= MAX_CONSECUTIVE_SKIPS) {
        playbackStalledBus.emit({ track: item.track, error: result.error, failures: skipped });
        _transientFailures = 0;
        break;
      }
      index++;
    }

    resetPlaybackSelection();
  }

  async function setQueue(
    tracks: PlayerTrack[],
    startIndex: number = 0,
    source: QueueSource = { type: "unknown" },
    options?: { shuffled?: boolean },
  ): Promise<void> {
    if (tracks.length === 0) {
      clear();
      return;
    }

    shadowPinRemoteTracks(tracks);
    const nextItems = createQueueItems(tracks, source);
    const shouldShuffle = options?.shuffled ?? isShuffled.value;
    const playbackQueue = buildPlaybackQueue(nextItems, startIndex, shouldShuffle);

    commit({
      items: nextItems,
      playbackOrder: shouldShuffle ? playbackQueue.items.map(item => item.id) : null,
      currentItemId: null,
    });

    await playFrom(
      playbackQueue.playbackIndex,
      Math.max(playbackQueue.items.length - playbackQueue.playbackIndex, 1),
    );
  }

  async function restorePersistedQueue(): Promise<void> {
    const snapshot = persistedSnapshot.value;

    if (!snapshot) return;
    // Unknown snapshot shape (e.g. downgrade from a newer build): leave both
    // memory and the stored data untouched rather than mis-parse and wipe.
    const { version } = snapshot as { version: number };
    if (version !== 1) return;

    const epochAtStart = _mutationEpoch;

    try {
      const restored = await rehydratePersistedQueue(snapshot);
      if (_mutationEpoch !== epochAtStart) return;

      if (!restored) {
        clear();
        return;
      }

      commit(restored);

      // Nothing is loaded yet: the player shows the restored entry and loads
      // it on the first play(). A player that is already showing something
      // (an open-with launch that bypassed this queue) keeps it.
      const player = usePlayerStore();
      const restoredTrack = currentTrack.value;
      if (restoredTrack && !player.currentTrack) player.presentTrack(restoredTrack);
    }
    catch (error) {
      getLogger().error(`[Queue] Failed to restore persisted queue: ${String(error)}`);
      // Infrastructure failure (DB hiccup): reset memory but keep the stored
      // snapshot untouched so the next healthy launch can still restore it.
      commit(EMPTY_STATE, { persist: false });
    }
  }

  function addToQueue(
    track: PlayerTrack,
    source: QueueSource = { type: "manual" },
  ): void {
    addMultipleToQueue([track], source);
  }

  function addMultipleToQueue(
    tracks: PlayerTrack[],
    source: QueueSource = { type: "manual" },
  ): void {
    const added = tracks.map(t => createItem(t, source));
    commit({
      items: [...items.value, ...added],
      playbackOrder: playbackOrder.value
        ? [...playbackOrder.value, ...added.map(item => item.id)]
        : null,
    });
  }

  const autoplay = createAutoplayRecommender({
    repeatMode: () => repeatMode.value,
    queue: () => queue.value,
    currentIndex: () => currentIndex.value,
    currentItem: () => currentItem.value,
    append: tracks => addMultipleToQueue(tracks, { type: "recommendation" }),
  });
  const ensureAutoplayRecommendations = () => autoplay.ensure();

  // Goes right after the current entry in BOTH orders: after it in the
  // playback order the user is looking at, and after it in the original
  // order so a later unshuffle keeps it next to the track it was queued
  // behind. With nothing current it goes to the head.
  function insertNext(
    track: PlayerTrack,
    source: QueueSource = { type: "manual" },
  ): QueueItem {
    const item = createItem(track, source);
    const current = currentItem.value;

    const originalAt = current
      ? items.value.findIndex(candidate => candidate.id === current.id) + 1
      : 0;
    const playbackAt = currentIndex.value >= 0 ? currentIndex.value + 1 : 0;

    commit({
      items: insertAt(items.value, originalAt, item),
      playbackOrder: playbackOrder.value
        ? insertAt(playbackOrder.value, playbackAt, item.id)
        : null,
    });
    return item;
  }

  function insertMultipleNext(
    tracks: PlayerTrack[],
    source: QueueSource = { type: "manual" },
  ): QueueItem[] {
    if (tracks.length === 0) return [];
    const added = tracks.map(t => createItem(t, source));
    const current = currentItem.value;

    const originalAt = current
      ? items.value.findIndex(candidate => candidate.id === current.id) + 1
      : 0;
    const playbackAt = currentIndex.value >= 0 ? currentIndex.value + 1 : 0;

    commit({
      items: insertAt(items.value, originalAt, ...added),
      playbackOrder: playbackOrder.value
        ? insertAt(playbackOrder.value, playbackAt, ...added.map(item => item.id))
        : null,
    });
    return added;
  }

  /**
   * The current track ended on its own: repeat-one restarts it, otherwise
   * the queue moves on exactly like `next()`.
   */
  async function advance(): Promise<void> {
    if (queue.value.length === 0) return;

    if (repeatMode.value === "one") {
      const item = currentItem.value;
      // The media is still in the engine: rewind it rather than resolve and
      // load the same track again (a network round trip for a stream).
      _playbackClaim++;
      if (await usePlayerStore().restartCurrent()) {
        _transientFailures = 0;
        return;
      }
      // The player retries a transient failure itself; if the restart still
      // fails, give up explicitly instead of leaving playback in a silent
      // half-error state with the selection intact.
      const result = await playAtIndex(currentIndex.value);
      if (result.isErr()) {
        if (item) reactToFailure(item.track, result.error);
        resetPlaybackSelection();
      }
      return;
    }

    if (currentIndex.value < queue.value.length - 1) {
      await playFrom(currentIndex.value + 1);
    }
    else if (repeatMode.value === "all") {
      await playFrom(0);
    }
    else {
      const claimAtStart = _playbackClaim;
      const appendedRecommendations = await ensureAutoplayRecommendations();

      if (_playbackClaim !== claimAtStart) return;

      if (appendedRecommendations) {
        await playFrom(currentIndex.value + 1);
        return;
      }

      resetPlaybackSelection();
    }
  }

  /**
   * The user asked for the next track. In repeat-one that is a request to
   * stop looping: the mode falls back to repeat-all and the queue moves on
   * (wrapping at the end) instead of restarting the same track.
   */
  async function next(): Promise<void> {
    if (repeatMode.value === "one") repeatMode.value = "all";
    await advance();
  }

  async function previous(): Promise<void> {
    if (queue.value.length === 0) return;
    const player = usePlayerStore();

    // Restart-at-zero needs a seekable track: on live streams seekTo is a
    // silent no-op and would swallow the button press entirely.
    if (player.currentTime > RESTART_THRESHOLD && player.canSeek) {
      player.seekTo(0);
      return;
    }

    if (currentIndex.value > 0) {
      await playSingle(currentIndex.value - 1);
    }
    else if (repeatMode.value === "all") {
      await playSingle(queue.value.length - 1);
    }
    else {
      player.seekTo(0);
    }
  }

  async function jumpTo(index: number): Promise<void> {
    if (index < 0 || index >= queue.value.length) return;
    await playSingle(index);
  }

  async function jumpToId(id: QueueItemId): Promise<void> {
    const index = queue.value.findIndex(item => item.id === id);
    if (index >= 0) {
      await playSingle(index);
    }
  }

  function removeFromQueue(id: QueueItemId): Promise<void> {
    return removeMultiple([id]);
  }

  async function removeMultiple(ids: QueueItemId[]): Promise<void> {
    const idSet = new Set(ids);
    if (!queue.value.some(item => idSet.has(item.id))) return;

    const oldIndex = currentIndex.value;
    const wasCurrentRemoved = currentItemId.value !== null && idSet.has(currentItemId.value);
    // The successor is whatever now sits where the current entry was: its
    // position shifts down by every removed item that sat above it.
    const removedBeforeCurrent = queue.value
      .filter((item, index) => index < oldIndex && idSet.has(item.id))
      .length;

    commit({
      items: items.value.filter(item => !idSet.has(item.id)),
      playbackOrder: playbackOrder.value
        ? playbackOrder.value.filter(itemId => !idSet.has(itemId))
        : null,
      currentItemId: wasCurrentRemoved ? null : currentItemId.value,
    });

    if (items.value.length === 0) {
      resetPlaybackSelection();
      return;
    }

    if (wasCurrentRemoved) {
      const successorIndex = Math.min(
        Math.max(oldIndex - removedBeforeCurrent, 0),
        queue.value.length - 1,
      );
      const player = usePlayerStore();
      // Removing what is playing hands playback to the successor (which may
      // be unplayable too: keep going, as next() would). Removing a paused
      // entry only moves the selection — the user did not ask for sound.
      if (player.isPlaybackIntended) {
        await playFrom(successorIndex);
        return;
      }
      const successor = itemAt(successorIndex);
      if (!successor) return;
      commit({ currentItemId: successor.id });
      player.selectTrack(successor.track);
    }
  }

  function moveTrack(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= queue.value.length) return;
    if (toIndex < 0 || toIndex >= queue.value.length) return;

    // A drag reorders whichever order is on screen; the selection follows
    // its item by identity, so nothing about currentIndex needs fixing up.
    if (playbackOrder.value) {
      commit({ playbackOrder: moveItem(playbackOrder.value, fromIndex, toIndex) });
    }
    else {
      commit({ items: moveItem(items.value, fromIndex, toIndex) });
    }
  }

  function shuffle(): void {
    const current = currentItem.value;
    const currentOriginalIndex = current
      ? items.value.findIndex(item => item.id === current.id)
      : null;

    commit({
      playbackOrder: buildPlaybackQueue(items.value, currentOriginalIndex, true)
        .items
        .map(item => item.id),
    });
  }

  function unshuffle(): void {
    if (!isShuffled.value) return;
    commit({ playbackOrder: null });
  }

  const toggleRepeat = () => {
    const idx = REPEAT_MODES.indexOf(repeatMode.value);
    repeatMode.value = REPEAT_MODES[(idx + 1) % REPEAT_MODES.length];
  };

  function toggleShuffle(): void {
    if (isShuffled.value) {
      unshuffle();
    }
    else {
      shuffle();
    }
  }

  function clear(): void {
    commit(EMPTY_STATE);
    const player = usePlayerStore();
    player.stop();
    player.clearCurrentTrack();
  }

  return {
    queue,
    originalQueue,
    currentIndex,
    isShuffled,
    persistedSnapshot,
    repeatMode,

    currentItem,
    currentTrack,
    hasNext,
    hasPrevious,
    isEmpty,
    size,
    upcomingItems,
    previousItems,

    setQueue,
    restorePersistedQueue,
    hydrate,
    addToQueue,
    addMultipleToQueue,
    insertNext,
    insertMultipleNext,
    next,
    advance,
    previous,
    ensureAutoplayRecommendations,
    jumpTo,
    jumpToId,
    removeFromQueue,
    removeMultiple,
    moveTrack,
    shuffle,
    unshuffle,
    syncTrackMetadata,
    swapEphemeralForLibrary,
    toggleShuffle,
    toggleRepeat,
    clear,
  };
}, {
  persist: {
    key: QUEUE_STORAGE_KEY,
    // A drag-reorder is a burst of commits, each rebuilding the snapshot;
    // coalesce the writes.
    storage: createDebouncedLocalStorage(300),
    pick: ["persistedSnapshot", "repeatMode"],
    afterHydrate: ({ store }) => {
      const queueStore = store as typeof store & {
        repeatMode: RepeatMode;
        restorePersistedQueue: () => Promise<void>;
      };
      const legacyRepeatMode = readLegacyRepeatMode();
      if (legacyRepeatMode) queueStore.repeatMode = legacyRepeatMode;
      queueStore.restorePersistedQueue().catch(() => {});
    },
  },
});
