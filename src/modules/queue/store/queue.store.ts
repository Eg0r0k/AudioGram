import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import { TrackSource } from "@/db/entities";
import { StorageError, StorageErrorCode } from "@/db/errors/storage.errors";
import { trackRepository } from "@/db/repositories";
import { QueueItemId } from "@/types/ids";
import { type Track, isEphemeralTrack, type PlayerTrack } from "@/modules/player/types";
import { isSameQueueSource, type QueueItem, type QueueSource } from "../types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { mapTrackEntityToPlayerTrack } from "@/modules/player/utils/trackEntity";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";
import { fisherYatesShuffle } from "@/lib/shuffle";
import { unique, unwrapResult } from "@/queries/shared";

const RESTART_THRESHOLD = 3;
const AUTOPLAY_RECOMMENDATION_LIMIT = 5;
const QUEUE_STORAGE_KEY = "audiogram-queue-v1";

interface PersistedLibraryTrack {
  kind: "library";
  trackId: Track["id"];
}

interface PersistedEphemeralTrack {
  kind: "ephemeral";
  id: string;
  title: string;
  artist?: string;
  albumName?: string;
  duration?: number;
  cover?: string;
  source: { type: "path"; path: string } | { type: "url"; url: string };
}

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
  isShuffled: boolean;
}

export const useQueueStore = defineStore("queue", () => {
  const playerStore = usePlayerStore();

  const queue = ref<QueueItem[]>([]);
  const originalQueueOrder = ref<QueueItemId[]>([]);
  const currentIndex = ref(-1);
  const isShuffled = ref(false);
  const persistedSnapshot = ref<PersistedQueueSnapshot | null>(null);

  let autoplayRecommendationsPromise: Promise<boolean> | null = null;

  const originalQueue = computed<QueueItem[]>(() => {
    if (originalQueueOrder.value.length === 0) return [];

    const itemsById = new Map(queue.value.map(item => [item.id, item]));

    return originalQueueOrder.value.flatMap((id) => {
      const item = itemsById.get(id);
      return item ? [item] : [];
    });
  });

  const currentItem = computed<QueueItem | null>(() => {
    const idx = currentIndex.value;
    if (idx < 0 || idx >= queue.value.length) return null;
    return queue.value[idx];
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

    queue.value = patchQueueItem(queue.value, nextTrack);
  }

  function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
    const nextList = list.slice();
    const [item] = nextList.splice(fromIndex, 1);

    if (!item) return list;

    nextList.splice(toIndex, 0, item);
    return nextList;
  }

  function removeOriginalQueueItems(ids: QueueItemId[]): void {
    const idSet = new Set(ids);
    originalQueueOrder.value = originalQueueOrder.value.filter(id => !idSet.has(id));
  }

  function insertOriginalQueueNext(item: QueueItem): void {
    if (!isShuffled.value) {
      const insertAt = currentIndex.value >= 0
        ? currentIndex.value + 1
        : originalQueueOrder.value.length;

      originalQueueOrder.value.splice(insertAt, 0, item.id);
      return;
    }

    const currentId = currentItem.value?.id;
    if (!currentId) {
      originalQueueOrder.value.push(item.id);
      return;
    }

    const currentOriginalIndex = originalQueueOrder.value.findIndex(id => id === currentId);
    if (currentOriginalIndex === -1) {
      originalQueueOrder.value.push(item.id);
      return;
    }

    originalQueueOrder.value.splice(currentOriginalIndex + 1, 0, item.id);
  }

  function getItemsByOrder(ids: QueueItemId[]): QueueItem[] {
    if (ids.length === 0) return [];

    const itemsById = new Map(queue.value.map(item => [item.id, item]));

    return ids.flatMap((id) => {
      const item = itemsById.get(id);
      return item ? [item] : [];
    });
  }

  function buildPlaybackQueue(
    items: QueueItem[],
    startIndex: number,
    shuffled: boolean,
  ): { items: QueueItem[]; playbackIndex: number } {
    if (!shuffled) {
      return {
        items: [...items],
        playbackIndex: startIndex,
      };
    }

    const current = items[startIndex];

    if (!current) {
      return {
        items: fisherYatesShuffle(items),
        playbackIndex: items.length > 0 ? 0 : -1,
      };
    }

    const rest = items.filter((_, index) => index !== startIndex);

    return {
      items: [current, ...fisherYatesShuffle(rest)],
      playbackIndex: 0,
    };
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
      originalQueueOrder: originalQueueOrder.value.filter(id => persistedIds.has(id)),
      currentIndex: persistedCurrentItemId
        ? persistedQueue.findIndex(item => item.id === persistedCurrentItemId)
        : -1,
      isShuffled: isShuffled.value,
    };
  }

  function syncPersistedSnapshot(): void {
    persistedSnapshot.value = buildPersistedQueueSnapshot();
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
    currentIndex.value = -1;
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
    if (index < 0 || index >= queue.value.length) return false;

    currentIndex.value = index;
    const item = queue.value[index];

    try {
      await playerStore.playPlayerTrack(item.track);
      return true;
    }
    catch (err) {
      console.error(`[Queue] Failed to play "${item.track.title}":`, err);
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

    const items = createQueueItems(tracks, source);
    const safeIndex = Math.max(0, Math.min(startIndex, items.length - 1));
    const shouldShuffle = options?.shuffled ?? isShuffled.value;
    const playbackQueue = buildPlaybackQueue(items, safeIndex, shouldShuffle);

    originalQueueOrder.value = items.map(item => item.id);
    queue.value = playbackQueue.items;
    isShuffled.value = shouldShuffle;

    currentIndex.value = playbackQueue.playbackIndex - 1;
    const success = await playAtIndex(playbackQueue.playbackIndex);
    if (!success) {
      await skipToNextPlayable(Math.max(playbackQueue.items.length - playbackQueue.playbackIndex, 1));
    }
  }

  async function restorePersistedQueue(): Promise<void> {
    const snapshot = persistedSnapshot.value;

    if (!snapshot) return;

    try {
      const libraryTrackIds = unique(snapshot.queue.flatMap((item) => {
        if (item.track.kind !== "library") return [];
        return [item.track.trackId];
      }));

      const libraryTracks = libraryTrackIds.length > 0
        ? await unwrapResult(trackRepository.findByIds(libraryTrackIds))
        : [];
      const libraryTracksById = new Map(libraryTracks.map(track => [track.id, mapTrackEntityToPlayerTrack(track)]));

      const restoredQueue: QueueItem[] = [];

      for (const item of snapshot.queue) {
        if (item.track.kind === "library") {
          const track = libraryTracksById.get(item.track.trackId);
          if (!track) continue;

          restoredQueue.push({
            id: item.id,
            track,
            source: item.source,
            addedAt: item.addedAt,
            cover: item.cover,
          });
          continue;
        }

        restoredQueue.push({
          id: item.id,
          track: item.track,
          source: item.source,
          addedAt: item.addedAt,
          cover: item.cover,
        });
      }

      if (restoredQueue.length === 0) {
        clear();
        return;
      }

      const queueIds = new Set(restoredQueue.map(item => item.id));
      const restoredOriginalQueueOrder = snapshot.originalQueueOrder.filter(id => queueIds.has(id));

      queue.value = restoredQueue;
      originalQueueOrder.value = restoredOriginalQueueOrder.length > 0
        ? restoredOriginalQueueOrder
        : restoredQueue.map(item => item.id);
      currentIndex.value = snapshot.currentIndex >= 0 && snapshot.currentIndex < restoredQueue.length
        ? snapshot.currentIndex
        : -1;
      isShuffled.value = snapshot.isShuffled;

      const restoredCurrentItem = currentItem.value;
      if (restoredCurrentItem) {
        playerStore.currentTrack = restoredCurrentItem.track;
      }
      else {
        playerStore.clearCurrentTrack();
      }

      syncPersistedSnapshot();
    }
    catch (error) {
      console.error("[Queue] Failed to restore persisted queue:", error);
      clear();
    }
  }

  function addToQueue(
    track: PlayerTrack,
    source: QueueSource = { type: "manual" },
  ): void {
    const item = createItem(track, source);
    queue.value.push(item);
    originalQueueOrder.value.push(item.id);
  }

  function addMultipleToQueue(
    tracks: PlayerTrack[],
    source: QueueSource = { type: "manual" },
  ): void {
    const items = tracks.map(t => createItem(t, source));
    queue.value.push(...items);
    originalQueueOrder.value.push(...items.map(item => item.id));
  }

  async function appendAutoplayRecommendations(): Promise<boolean> {
    if (playerStore.repeatMode !== "off") return false;
    if (currentIndex.value !== queue.value.length - 1) return false;

    const sourceItem = currentItem.value;
    if (!sourceItem || sourceItem.track.kind !== "library") return false;

    const sourceItemId = sourceItem.id;

    const queueLibraryIds = queue.value
      .flatMap(item => item.track.kind === "library" ? [item.track.id] : []);
    const additionalExcludeIds = [...new Set(queueLibraryIds)];

    let recommendations: Awaited<ReturnType<typeof getRecommendations>>;

    try {
      recommendations = await getRecommendations(
        sourceItem.track.id,
        AUTOPLAY_RECOMMENDATION_LIMIT,
        additionalExcludeIds,
      );
    }
    catch (error) {
      console.error("[Queue] Failed to load autoplay recommendations:", error);
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

  function insertNext(
    track: PlayerTrack,
    source: QueueSource = { type: "manual" },
  ): void {
    const insertAt = currentIndex.value >= 0
      ? currentIndex.value + 1
      : 0;

    const item = createItem(track, source);

    queue.value.splice(insertAt, 0, item);
    insertOriginalQueueNext(item);
  }

  async function next(): Promise<void> {
    if (queue.value.length === 0) return;

    if (playerStore.repeatMode === "one") {
      await playAtIndex(currentIndex.value);
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

    if (playerStore.currentTime > RESTART_THRESHOLD) {
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
    const index = queue.value.findIndex(item => item.id === id);
    if (index === -1) return;

    const isCurrentlyPlaying = index === currentIndex.value;

    queue.value.splice(index, 1);
    removeOriginalQueueItems([id]);

    if (queue.value.length === 0) {
      resetPlaybackSelection();
      return;
    }

    if (index < currentIndex.value) {
      currentIndex.value--;
    }
    else if (isCurrentlyPlaying) {
      if (currentIndex.value >= queue.value.length) {
        currentIndex.value = queue.value.length - 1;
      }
      playAtIndex(currentIndex.value);
    }
  }

  function removeMultiple(ids: QueueItemId[]): void {
    const idSet = new Set(ids);
    const currentItemId = currentItem.value?.id;
    const wasCurrentRemoved = currentItemId && idSet.has(currentItemId);

    queue.value = queue.value.filter(item => !idSet.has(item.id));
    removeOriginalQueueItems(ids);

    if (queue.value.length === 0) {
      resetPlaybackSelection();
      return;
    }

    if (wasCurrentRemoved) {
      const safeIndex = Math.min(currentIndex.value, queue.value.length - 1);
      playAtIndex(safeIndex);
    }
    else if (currentItemId) {
      const newIndex = queue.value.findIndex(item => item.id === currentItemId);
      currentIndex.value = newIndex >= 0 ? newIndex : 0;
    }
  }

  function moveTrack(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= queue.value.length) return;
    if (toIndex < 0 || toIndex >= queue.value.length) return;

    queue.value = moveItem(queue.value, fromIndex, toIndex);

    if (!isShuffled.value) {
      originalQueueOrder.value = moveItem(originalQueueOrder.value, fromIndex, toIndex);
    }

    if (fromIndex === currentIndex.value) {
      currentIndex.value = toIndex;
    }
    else if (fromIndex < currentIndex.value && toIndex >= currentIndex.value) {
      currentIndex.value--;
    }
    else if (fromIndex > currentIndex.value && toIndex <= currentIndex.value) {
      currentIndex.value++;
    }
  }

  function shuffle(): void {
    isShuffled.value = true;

    const baseQueue = originalQueueOrder.value.length > 0
      ? getItemsByOrder(originalQueueOrder.value)
      : [...queue.value];

    if (baseQueue.length === 0) return;

    originalQueueOrder.value = baseQueue.map(item => item.id);

    if (currentIndex.value < 0 || !currentItem.value) {
      queue.value = fisherYatesShuffle(baseQueue);
      return;
    }

    const currentId = currentItem.value.id;
    const currentOriginalIndex = baseQueue.findIndex(item => item.id === currentId);
    const playbackQueue = buildPlaybackQueue(
      baseQueue,
      currentOriginalIndex >= 0 ? currentOriginalIndex : 0,
      true,
    );

    queue.value = playbackQueue.items;
    currentIndex.value = playbackQueue.playbackIndex;
  }

  function unshuffle(): void {
    if (!isShuffled.value) return;

    isShuffled.value = false;

    if (originalQueueOrder.value.length === 0) return;

    const currentId = currentItem.value?.id;
    queue.value = getItemsByOrder(originalQueueOrder.value);

    if (!currentId) {
      currentIndex.value = -1;
      return;
    }

    const newIndex = queue.value.findIndex(item => item.id === currentId);
    currentIndex.value = newIndex >= 0 ? newIndex : 0;
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
    queue.value = [];
    originalQueueOrder.value = [];
    resetPlaybackSelection();
    isShuffled.value = false;
  }

  watch(
    () => playerStore.trackEndedSignal,
    (newVal) => {
      if (newVal === 0) return;
      next();
    },
  );

  watch([queue, originalQueueOrder, currentIndex, isShuffled], () => {
    syncPersistedSnapshot();
  }, { deep: true });

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
    jumpTo,
    jumpToId,
    removeFromQueue,
    removeMultiple,
    moveTrack,
    shuffle,
    unshuffle,
    syncTrackMetadata,
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
