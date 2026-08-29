import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import { TrackSource } from "@/db/entities";
import { StorageError, StorageErrorCode } from "@/db/errors/storage.errors";
import { trackRepository } from "@/db/repositories";
import { QueueItemId } from "@/types/ids";
import { type Track, type EphemeralTrack, isEphemeralTrack, type PlayerTrack } from "@/modules/player/types";
import { isSameQueueSource, type QueueItem, type QueueSource } from "../types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { mapTrackEntityToPlayerTrack } from "@/modules/player/utils/trackEntity";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";
import { unique, unwrapResult } from "@/queries/shared";
import { migrateProxyUrl } from "@/lib/stream-url";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { getLogger } from "@/lib/logger";
import { buildPlaybackQueue, getItemsByOrder, moveItem } from "../lib/queue-order";

const RESTART_THRESHOLD = 3;
const AUTOPLAY_RECOMMENDATION_LIMIT = 5;
const QUEUE_STORAGE_KEY = "audiogram-queue-v1";

interface PersistedLibraryTrack {
  kind: "library";
  trackId: Track["id"];
}

type PersistedEphemeralTrack = Pick<EphemeralTrack, "id" | "title" | "artist" | "albumName" | "duration" | "cover"> & {
  kind: "ephemeral";
  source: { type: "path"; path: string } | { type: "url"; url: string };
};

type PersistedQueueTrack = PersistedLibraryTrack | PersistedEphemeralTrack;

interface PersistedQueueItem {
  id: QueueItemId;
  track: PersistedQueueTrack;
  source: QueueSource;
  addedAt: number;
  cover?: string | null;
}

interface PersistedQueueSnapshot {
  version: 1;
  queue: PersistedQueueItem[];
  originalQueueOrder: QueueItemId[];
  currentIndex: number;
  /**
   * Authoritative over currentIndex on restore: tracks deleted from the
   * library between sessions shorten the restored queue, and a positional
   * index would then point at a neighbour. Older v1 snapshots lack it.
   */
  currentItemId?: QueueItemId;
  isShuffled: boolean;
}

const insertAt = <T>(list: readonly T[], index: number, ...values: T[]): T[] => [
  ...list.slice(0, index),
  ...values,
  ...list.slice(index),
];

// The media server's port and token change every launch, so any stored
// proxy URL (playback or cover, current or legacy stream://-era form)
// must be re-pointed at the live base; foreign URLs pass through.
const migrateCover = (cover: string | null | undefined) =>
  cover ? migrateProxyUrl(cover) : cover;

const rehydrateQueueItem = (
  item: PersistedQueueItem,
  libraryTracksById: ReadonlyMap<Track["id"], PlayerTrack>,
): QueueItem | null => {
  if (item.track.kind === "library") {
    const track = libraryTracksById.get(item.track.trackId);
    if (!track) return null;
    return {
      id: item.id,
      track,
      source: item.source,
      addedAt: item.addedAt,
      cover: migrateCover(item.cover),
    };
  }

  return {
    id: item.id,
    track: {
      ...item.track,
      cover: migrateCover(item.track.cover) ?? undefined,
      source: item.track.source.type === "url"
        ? { ...item.track.source, url: migrateProxyUrl(item.track.source.url) }
        : item.track.source,
    },
    source: item.source,
    addedAt: item.addedAt,
    cover: migrateCover(item.cover),
  };
};

export const useQueueStore = defineStore("queue", () => {
  const playerStore = usePlayerStore();

  // Canonical state — the only three things a mutation writes. Everything
  // the UI reads (queue, currentIndex, currentItem, isShuffled, ...) derives
  // from them, so there is no second copy to keep in sync. Mutations
  // reassign whole arrays rather than splicing in place.
  //
  // `items` is the queue in the order tracks were added; `playbackOrder` is
  // null while unshuffled and otherwise a permutation of every item id;
  // `currentItemId` identifies the playing entry by identity, so removing or
  // reordering around it cannot move the selection.
  const items = ref<QueueItem[]>([]);
  const playbackOrder = ref<QueueItemId[] | null>(null);
  const currentItemId = ref<QueueItemId | null>(null);
  const persistedSnapshot = ref<PersistedQueueSnapshot | null>(null);

  // Bumped by every queue mutation. restorePersistedQueue captures it before
  // its async DB read and refuses to commit when the user acted in that gap
  // (open-with launch, an early click) — their state wins over yesterday's.
  let _mutationEpoch = 0;
  const markQueueMutation = () => {
    _mutationEpoch++;
  };

  let autoplayRecommendationsPromise: Promise<boolean> | null = null;

  const originalQueue = computed<QueueItem[]>(() => items.value);

  // The three derived fields below stay writable for the existing tests,
  // which seed state through them. Writing one settles the canonical state
  // to what that value would look like: a new `queue` replaces the items
  // (and, while shuffled, becomes the playback order), `currentIndex` picks
  // the entry at that position, `isShuffled` freezes or drops the order.
  const queue = computed<QueueItem[]>({
    get: () => playbackOrder.value
      ? getItemsByOrder(items.value, playbackOrder.value)
      : items.value,
    set: (list) => {
      items.value = list;
      if (playbackOrder.value) playbackOrder.value = list.map(item => item.id);
      if (currentItemId.value !== null && !list.some(item => item.id === currentItemId.value)) {
        currentItemId.value = null;
      }
    },
  });

  const isShuffled = computed<boolean>({
    get: () => playbackOrder.value !== null,
    set: (shuffled) => {
      if (shuffled === (playbackOrder.value !== null)) return;
      playbackOrder.value = shuffled ? queue.value.map(item => item.id) : null;
    },
  });

  const currentIndex = computed<number>({
    get: () => {
      if (currentItemId.value === null) return -1;
      return queue.value.findIndex(item => item.id === currentItemId.value);
    },
    set: (index) => {
      currentItemId.value = queue.value[index]?.id ?? null;
    },
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
    if (playerStore.repeatMode !== "off") return true;
    return currentIndex.value < queue.value.length - 1;
  });

  const hasPrevious = computed(() => {
    if (queue.value.length === 0) return false;
    if (playerStore.repeatMode === "all") return true;
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

  // Dev-only: the canonical state is small enough to check exhaustively
  // after every mutation, and a broken permutation would otherwise surface
  // as a silently shorter queue.
  const assertQueueInvariants = () => {
    if (!import.meta.env.DEV) return;
    const order = playbackOrder.value;
    if (order) {
      const ids = new Set(items.value.map(item => item.id));
      const isPermutation = order.length === ids.size
        && new Set(order).size === order.length
        && order.every(id => ids.has(id));
      if (!isPermutation) {
        throw new Error("[Queue] invariant violated: playbackOrder is not a permutation of items");
      }
    }
    if (currentItemId.value !== null && !items.value.some(item => item.id === currentItemId.value)) {
      throw new Error("[Queue] invariant violated: currentItemId points at no item");
    }
  };

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
    list: QueueItem[],
    nextTrack: PlayerTrack,
  ): QueueItem[] {
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

  function syncTrackMetadata(nextTrack: PlayerTrack): void {
    if (isEphemeralTrack(nextTrack)) return;

    markQueueMutation();
    items.value = patchQueueItem(items.value, nextTrack);
    const playing = playerStore.currentTrack;
    if (playing && !isEphemeralTrack(playing) && playing.id === nextTrack.id) {
      playerStore.currentTrack = { ...playing, ...nextTrack };
    }
    syncPersistedSnapshot();
  }

  /**
   * Import-from-player (M3): every queue entry holding the ephemeral track
   * becomes the freshly imported library track — item identity (id, source,
   * addedAt) survives. If the current entry swaps, the player's track
   * reference is updated directly; the audio element keeps playing the
   * already-loaded file, so playback never restarts.
   */
  function swapEphemeralForLibrary(ephemeralTrackId: string, libraryTrack: PlayerTrack): void {
    markQueueMutation();
    let swappedCurrent = false;

    items.value = items.value.map((item) => {
      if (!isEphemeralTrack(item.track) || item.track.id !== ephemeralTrackId) return item;
      if (item.id === currentItemId.value) swappedCurrent = true;
      return { ...item, track: libraryTrack };
    });

    if (swappedCurrent) {
      playerStore.currentTrack = libraryTrack;
    }
    syncPersistedSnapshot();
  }

  function getTrackQueueKey(track: PlayerTrack): string {
    return `${track.kind}:${track.id}`;
  }

  function serializeQueueItem(item: QueueItem): PersistedQueueItem | null {
    if (item.track.kind === "library") {
      return {
        id: item.id,
        track: {
          kind: "library",
          trackId: item.track.id,
        },
        source: item.source,
        addedAt: item.addedAt,
        cover: item.cover,
      };
    }

    if (item.track.source.type === "file") {
      return null;
    }

    return {
      id: item.id,
      track: {
        kind: "ephemeral",
        id: item.track.id,
        title: item.track.title,
        artist: item.track.artist,
        albumName: item.track.albumName,
        duration: item.track.duration,
        cover: item.track.cover,
        source: item.track.source,
      },
      source: item.source,
      addedAt: item.addedAt,
      cover: item.cover,
    };
  }

  // The v1 format stores both orders; they are derived from the canonical
  // state here, so the file layout is unchanged while the runtime model is.
  function buildPersistedQueueSnapshot(): PersistedQueueSnapshot | null {
    const persistedQueue = queue.value
      .map(item => serializeQueueItem(item))
      .filter((item): item is PersistedQueueItem => item !== null);

    if (persistedQueue.length === 0) {
      return null;
    }

    const persistedIds = new Set(persistedQueue.map(item => item.id));
    const persistedCurrentItemId = currentItem.value?.id;

    return {
      version: 1,
      queue: persistedQueue,
      originalQueueOrder: items.value
        .map(item => item.id)
        .filter(id => persistedIds.has(id)),
      currentIndex: persistedCurrentItemId
        ? persistedQueue.findIndex(item => item.id === persistedCurrentItemId)
        : -1,
      currentItemId: persistedCurrentItemId,
      isShuffled: isShuffled.value,
    };
  }

  function syncPersistedSnapshot(): void {
    assertQueueInvariants();
    persistedSnapshot.value = buildPersistedQueueSnapshot();
  }

  function createQueueItems(tracks: PlayerTrack[], source: QueueSource): QueueItem[] {
    // Queued tracks from live browsing shadow-pin their rows so the persisted
    // snapshot (library kind → trackId only) can restore them. Idempotent
    // upserts, fire-and-forget.
    for (const track of tracks) {
      if (track.kind === "library" && track.sourceDto) {
        ensurePinned({ kind: "remote", dto: track.sourceDto }, { pinned: 0 }).catch((error) => {
          // A failed shadow-pin means this queued track will drop out of the
          // persisted queue on restore — surface it.
          getLogger().warn(`[Queue] Shadow-pin failed for ${track.id}: ${String(error)}`);
        });
      }
    }

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
    markQueueMutation();
    currentItemId.value = null;
    playerStore.stop();
    playerStore.clearCurrentTrack();
  }

  function handlePlaybackError(track: PlayerTrack, err: unknown): void {
    if (!isEphemeralTrack(track)
      && track.source === TrackSource.LOCAL_EXTERNAL
      && err instanceof StorageError
      && err.code === StorageErrorCode.FILE_NOT_FOUND) {
      toast.warning(i18n.global.t("watchedFolders.trackPathMissing"));
    }
  }

  async function playAtIndex(index: number): Promise<boolean> {
    const item = queue.value[index];
    if (!item) return false;

    markQueueMutation();
    currentItemId.value = item.id;

    try {
      await playerStore.playPlayerTrack(item.track);
      syncPersistedSnapshot();
      return true;
    }
    catch (err) {
      getLogger().error(`[Queue] Failed to play "${item.track.title}": ${String(err)}`);
      handlePlaybackError(item.track, err);
      return false;
    }
  }

  async function skipToNextPlayable(maxAttempts: number = queue.value.length): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const nextIdx = currentIndex.value + 1;

      if (nextIdx >= queue.value.length) {
        if (playerStore.repeatMode === "all") {
          const success = await playAtIndex(0);
          if (success) return;
        }
        resetPlaybackSelection();
        return;
      }

      const success = await playAtIndex(nextIdx);
      if (success) return;
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

    markQueueMutation();
    const nextItems = createQueueItems(tracks, source);
    const shouldShuffle = options?.shuffled ?? isShuffled.value;
    const playbackQueue = buildPlaybackQueue(nextItems, startIndex, shouldShuffle);

    items.value = nextItems;
    playbackOrder.value = shouldShuffle ? playbackQueue.items.map(item => item.id) : null;
    currentItemId.value = null;

    const success = await playAtIndex(playbackQueue.playbackIndex);
    if (!success) {
      await skipToNextPlayable(Math.max(playbackQueue.items.length - playbackQueue.playbackIndex, 1));
    }
    syncPersistedSnapshot();
  }

  async function restorePersistedQueue(): Promise<void> {
    const snapshot = persistedSnapshot.value;

    if (!snapshot) return;
    // Unknown snapshot shape (e.g. downgrade from a newer build): leave both
    // memory and the stored data untouched rather than mis-parse and wipe.
    if (snapshot.version !== 1) return;

    const epochAtStart = _mutationEpoch;

    try {
      const libraryTrackIds = unique(snapshot.queue.flatMap((item) => {
        if (item.track.kind !== "library") return [];
        return [item.track.trackId];
      }));

      const libraryTracks = libraryTrackIds.length > 0
        ? await unwrapResult(trackRepository.findByIds(libraryTrackIds))
        : [];
      if (_mutationEpoch !== epochAtStart) return;
      const libraryTracksById = new Map(libraryTracks.map(track => [track.id, mapTrackEntityToPlayerTrack(track)]));

      // In the snapshot's playback order; library rows gone from the DB drop out.
      const restoredQueue = snapshot.queue.flatMap((item) => {
        const restored = rehydrateQueueItem(item, libraryTracksById);
        return restored ? [restored] : [];
      });

      if (restoredQueue.length === 0) {
        clear();
        return;
      }

      // Unshuffled, the playback order IS the original order. Shuffled, the
      // original order is what unshuffle returns to; an entry the stored
      // order forgot (older snapshots) is kept at the end rather than lost.
      let restoredItems = restoredQueue;
      if (snapshot.isShuffled) {
        const restoredIds = new Set(restoredQueue.map(item => item.id));
        const originalIds = snapshot.originalQueueOrder.filter(id => restoredIds.has(id));
        const ordered = new Set(originalIds);
        restoredItems = [
          ...getItemsByOrder(restoredQueue, originalIds),
          ...restoredQueue.filter(item => !ordered.has(item.id)),
        ];
      }

      // currentItemId survives library deletions that shorten the restored
      // queue; the positional index is only a fallback for older v1 snapshots.
      const restoredCurrentId = snapshot.currentItemId ?? snapshot.queue[snapshot.currentIndex]?.id ?? null;

      items.value = restoredItems;
      playbackOrder.value = snapshot.isShuffled ? restoredQueue.map(item => item.id) : null;
      currentItemId.value = restoredCurrentId !== null && restoredQueue.some(item => item.id === restoredCurrentId)
        ? restoredCurrentId
        : null;

      // If playback already started this session (cold play of the persisted
      // track), the player owns its current track — don't reassign or clear
      // it out from under live audio.
      if (playerStore.status === "idle") {
        const restoredCurrentItem = currentItem.value;
        if (restoredCurrentItem) {
          playerStore.currentTrack = restoredCurrentItem.track;
        }
        else {
          playerStore.clearCurrentTrack();
        }
      }

      syncPersistedSnapshot();
    }
    catch (error) {
      getLogger().error(`[Queue] Failed to restore persisted queue: ${String(error)}`);
      // Infrastructure failure (DB hiccup): reset memory but keep the stored
      // snapshot untouched so the next healthy launch can still restore it.
      items.value = [];
      playbackOrder.value = null;
      currentItemId.value = null;
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
    markQueueMutation();
    const added = tracks.map(t => createItem(t, source));
    items.value = [...items.value, ...added];
    if (playbackOrder.value) {
      playbackOrder.value = [...playbackOrder.value, ...added.map(item => item.id)];
    }
    syncPersistedSnapshot();
  }

  async function appendAutoplayRecommendations(): Promise<boolean> {
    if (playerStore.repeatMode !== "off") return false;
    if (currentIndex.value !== queue.value.length - 1) return false;

    const sourceItem = currentItem.value;
    if (!sourceItem || sourceItem.track.kind !== "library") return false;

    const sourceItemId = sourceItem.id;

    const upcomingLibraryIds = queue.value
      .slice(currentIndex.value + 1)
      .flatMap(item => item.track.kind === "library" ? [item.track.id] : []);
    const additionalExcludeIds = [...new Set(upcomingLibraryIds)];

    let recommendations: Awaited<ReturnType<typeof getRecommendations>>;

    try {
      recommendations = await getRecommendations(
        sourceItem.track.id,
        AUTOPLAY_RECOMMENDATION_LIMIT,
        additionalExcludeIds,
      );

      if (recommendations.length < AUTOPLAY_RECOMMENDATION_LIMIT) {
        const fallback = await getRecommendations(
          sourceItem.track.id,
          AUTOPLAY_RECOMMENDATION_LIMIT,
        );
        recommendations = fallback;
      }
    }
    catch (error) {
      getLogger().error(`[Queue] Failed to load autoplay recommendations: ${String(error)}`);
      return false;
    }

    if (currentItem.value?.id !== sourceItemId) return false;
    if (playerStore.repeatMode !== "off") return false;
    if (currentIndex.value !== queue.value.length - 1) return false;

    const tracks = recommendations.map(({ track }) => mapTrackEntityToPlayerTrack(track));
    if (tracks.length === 0) return false;

    addMultipleToQueue(tracks, { type: "recommendation" });
    return true;
  }

  async function ensureAutoplayRecommendations(): Promise<boolean> {
    if (!autoplayRecommendationsPromise) {
      autoplayRecommendationsPromise = appendAutoplayRecommendations()
        .finally(() => {
          autoplayRecommendationsPromise = null;
        });
    }

    return autoplayRecommendationsPromise;
  }

  // Goes right after the current entry in BOTH orders: after it in the
  // playback order the user is looking at, and after it in the original
  // order so a later unshuffle keeps it next to the track it was queued
  // behind. With nothing current it goes to the head.
  function insertNext(
    track: PlayerTrack,
    source: QueueSource = { type: "manual" },
  ): void {
    markQueueMutation();
    const item = createItem(track, source);
    const current = currentItem.value;

    const originalAt = current
      ? items.value.findIndex(candidate => candidate.id === current.id) + 1
      : 0;
    items.value = insertAt(items.value, originalAt, item);

    if (playbackOrder.value) {
      const playbackAt = currentIndex.value >= 0 ? currentIndex.value + 1 : 0;
      playbackOrder.value = insertAt(playbackOrder.value, playbackAt, item.id);
    }
    syncPersistedSnapshot();
  }

  async function next(): Promise<void> {
    if (queue.value.length === 0) return;

    if (playerStore.repeatMode === "one") {
      // A transient failure (remote tracks re-resolve on every loop) gets one
      // retry; after that give up explicitly instead of leaving playback in a
      // silent half-error state with the selection intact.
      let restarted = await playAtIndex(currentIndex.value);
      if (!restarted) restarted = await playAtIndex(currentIndex.value);
      if (!restarted) resetPlaybackSelection();
      return;
    }

    if (currentIndex.value < queue.value.length - 1) {
      const success = await playAtIndex(currentIndex.value + 1);
      if (!success) await skipToNextPlayable();
    }
    else if (playerStore.repeatMode === "all") {
      const success = await playAtIndex(0);
      if (!success) await skipToNextPlayable();
    }
    else {
      const appendedRecommendations = await ensureAutoplayRecommendations();
      if (appendedRecommendations) {
        const success = await playAtIndex(currentIndex.value + 1);
        if (!success) await skipToNextPlayable();
        return;
      }

      resetPlaybackSelection();
    }
  }

  async function previous(): Promise<void> {
    if (queue.value.length === 0) return;

    // Restart-at-zero needs a seekable track: on live streams seekTo is a
    // silent no-op and would swallow the button press entirely.
    if (playerStore.currentTime > RESTART_THRESHOLD && playerStore.canSeek) {
      playerStore.seekTo(0);
      return;
    }

    if (currentIndex.value > 0) {
      await playAtIndex(currentIndex.value - 1);
    }
    else if (playerStore.repeatMode === "all") {
      await playAtIndex(queue.value.length - 1);
    }
    else {
      playerStore.seekTo(0);
    }
  }

  async function jumpTo(index: number): Promise<void> {
    if (index < 0 || index >= queue.value.length) return;
    await playAtIndex(index);
  }

  async function jumpToId(id: QueueItemId): Promise<void> {
    const index = queue.value.findIndex(item => item.id === id);
    if (index >= 0) {
      await playAtIndex(index);
    }
  }

  function removeFromQueue(id: QueueItemId): void {
    removeMultiple([id]);
  }

  function removeMultiple(ids: QueueItemId[]): void {
    const idSet = new Set(ids);
    if (!queue.value.some(item => idSet.has(item.id))) return;

    markQueueMutation();
    const oldIndex = currentIndex.value;
    const wasCurrentRemoved = currentItemId.value !== null && idSet.has(currentItemId.value);
    // The successor is whatever now sits where the current entry was: its
    // position shifts down by every removed item that sat above it.
    const removedBeforeCurrent = queue.value
      .filter((item, index) => index < oldIndex && idSet.has(item.id))
      .length;

    items.value = items.value.filter(item => !idSet.has(item.id));
    if (playbackOrder.value) {
      playbackOrder.value = playbackOrder.value.filter(itemId => !idSet.has(itemId));
    }

    if (items.value.length === 0) {
      resetPlaybackSelection();
      syncPersistedSnapshot();
      return;
    }

    if (wasCurrentRemoved) {
      const successorIndex = Math.min(
        Math.max(oldIndex - removedBeforeCurrent, 0),
        queue.value.length - 1,
      );
      playAtIndex(successorIndex);
    }
    syncPersistedSnapshot();
  }

  function moveTrack(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= queue.value.length) return;
    if (toIndex < 0 || toIndex >= queue.value.length) return;

    markQueueMutation();
    // A drag reorders whichever order is on screen; the selection follows
    // its item by identity, so nothing about currentIndex needs fixing up.
    if (playbackOrder.value) {
      playbackOrder.value = moveItem(playbackOrder.value, fromIndex, toIndex);
    }
    else {
      items.value = moveItem(items.value, fromIndex, toIndex);
    }
    syncPersistedSnapshot();
  }

  function shuffle(): void {
    markQueueMutation();
    const current = currentItem.value;
    const currentOriginalIndex = current
      ? items.value.findIndex(item => item.id === current.id)
      : null;

    playbackOrder.value = buildPlaybackQueue(items.value, currentOriginalIndex, true)
      .items
      .map(item => item.id);
    syncPersistedSnapshot();
  }

  function unshuffle(): void {
    if (!isShuffled.value) return;

    markQueueMutation();
    playbackOrder.value = null;
    syncPersistedSnapshot();
  }

  function toggleShuffle(): void {
    if (isShuffled.value) {
      unshuffle();
    }
    else {
      shuffle();
    }
  }

  function clear(): void {
    markQueueMutation();
    items.value = [];
    playbackOrder.value = null;
    resetPlaybackSelection();
    syncPersistedSnapshot();
  }

  return {
    queue,
    originalQueue,
    currentIndex,
    isShuffled,
    persistedSnapshot,

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
    addToQueue,
    addMultipleToQueue,
    insertNext,
    next,
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
    clear,
  };
}, {
  persist: {
    key: QUEUE_STORAGE_KEY,
    pick: ["persistedSnapshot"],
    afterHydrate: ({ store }) => {
      (store as typeof store & { restorePersistedQueue: () => Promise<void> }).restorePersistedQueue();
    },
  },
});
