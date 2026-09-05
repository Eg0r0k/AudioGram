/* eslint-disable @typescript-eslint/no-explicit-any */
import { createApp, isReactive, nextTick, watch } from "vue";
import type { QueueItem } from "../types";
import { createPinia, setActivePinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackRepository } from "@/db/repositories";
import { TrackSource, TrackState, type TrackEntity } from "@/db/entities";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";
import { usePlayerStore } from "@/modules/player/store/player.store";
import type { Track } from "@/modules/player/types";
import { setMediaServerBaseForTests } from "@/lib/stream-url";
import { useEventBus } from "@vueuse/core";
import { PlaybackFailure } from "@/modules/player/service/playback-resolver.service";
import { playbackStalledEvent, trackSkippedEvent } from "../lib/queue-events";
import { useQueueStore } from "../store/queue.store";

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/db/repositories", () => ({
  trackRepository: {
    findByIds: vi.fn(),
  },
}));

vi.mock("@/modules/recommendations/service/recommender.service", () => ({
  getRecommendations: vi.fn(),
}));

function createTrack(id: string, title: string = "Test Track"): Track {
  return {
    kind: "library",
    id: id as Track["id"],
    title,
    artist: "Artist",
    artistIds: ["artist-1" as Track["artistIds"][number]],
    albumId: "album-1" as Track["albumId"],
    albumName: "Album",
    storagePath: `tracks/${id}.mp3`,
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    duration: 120,
    isLiked: false,
  };
}

function createTrackEntity(id: string, title: string = "Recommended Track"): TrackEntity {
  return {
    id: id as TrackEntity["id"],
    title,
    artistName: "Artist",
    albumTitle: "Album",
    artistIds: ["artist-1" as TrackEntity["artistIds"][number]],
    albumId: "album-1" as TrackEntity["albumId"],
    tagIds: [],
    source: TrackSource.LOCAL_INTERNAL,
    storagePath: `tracks/${id}.mp3`,
    state: TrackState.READY,
    duration: 120,
    format: {},
    playCount: 0,
    addedAt: Date.now(),
  };
}

function createRecommendation(track: TrackEntity) {
  return {
    trackId: track.id,
    track,
    score: 1,
    breakdown: {
      audioSimilarity: 1,
      coOccurrence: 0,
      completionRate: 1,
      recencyScore: 0,
      likedBonus: 0,
    },
  };
}

// Seeding helpers over hydrate(): the same semantics the store's derived
// fields used to have as writable seams.
type QueueStoreInstance = ReturnType<typeof useQueueStore>;
const seedQueueItems = (store: QueueStoreInstance, list: QueueItem[]) => {
  const currentId = store.currentItem?.id ?? null;
  const keepsCurrent = currentId !== null && list.some(item => item.id === currentId);
  store.hydrate({
    items: list,
    playbackOrder: store.isShuffled ? list.map(item => item.id) : null,
    currentItemId: keepsCurrent ? currentId : null,
  });
};
const seedCurrentIndex = (store: QueueStoreInstance, index: number) => {
  store.hydrate({
    items: store.originalQueue,
    playbackOrder: store.isShuffled ? store.queue.map(item => item.id) : null,
    currentItemId: store.queue[index]?.id ?? null,
  });
};
const seedShuffled = (store: QueueStoreInstance, shuffled: boolean) => {
  if (shuffled === store.isShuffled) return;
  store.hydrate({
    items: store.originalQueue,
    playbackOrder: shuffled ? store.queue.map(item => item.id) : null,
    currentItemId: store.currentItem?.id ?? null,
  });
};

describe("queue.store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([]));
    vi.mocked(getRecommendations).mockResolvedValue([]);
  });

  describe("initial state", () => {
    it("should have empty queue by default", () => {
      const store = useQueueStore();

      expect(store.queue).toEqual([]);
      expect(store.originalQueue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
      expect(store.isShuffled).toBe(false);
    });

    it("should compute isEmpty correctly", () => {
      const store = useQueueStore();

      expect(store.isEmpty).toBe(true);

      seedQueueItems(store, [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }]);
      expect(store.isEmpty).toBe(false);
    });

    it("should compute size correctly", () => {
      const store = useQueueStore();

      expect(store.size).toBe(0);

      seedQueueItems(store, [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      expect(store.size).toBe(2);
    });
  });

  describe("swapEphemeralForLibrary", () => {
    function createEphemeral(id: string, path: string) {
      return {
        kind: "ephemeral" as const,
        id,
        title: "Open-with file",
        source: { type: "path" as const, path },
      };
    }

    it("replaces every matching item's track in place, keeping item identity", () => {
      const store = useQueueStore();
      const library = createTrack("lib-1", "Imported");
      const items = [
        { id: "a" as any, track: createEphemeral("eph-1", "C:/x.flac"), source: { type: "manual" as const }, addedAt: 1 },
        { id: "b" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: 2 },
        { id: "c" as any, track: createEphemeral("eph-1", "C:/x.flac"), source: { type: "manual" as const }, addedAt: 3 },
      ];
      seedQueueItems(store, items as any);
      store.originalQueueOrder = ["a", "b", "c"] as any;

      store.swapEphemeralForLibrary("eph-1", library);

      expect(store.queue[0]).toMatchObject({ id: "a", addedAt: 1, track: library });
      expect(store.queue[1].track).toStrictEqual(createTrack("2"));
      expect(store.queue[2]).toMatchObject({ id: "c", addedAt: 3, track: library });
    });

    it("hands the library track to the player when the current item swaps, without restarting playback", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack");
      const ephemeral = createEphemeral("eph-1", "C:/x.flac");
      const library = createTrack("lib-1", "Imported");
      seedQueueItems(store, [
        { id: "a" as any, track: ephemeral, source: { type: "manual" as const }, addedAt: 1 },
      ] as any);
      seedCurrentIndex(store, 0);
      playerStore.currentTrack = ephemeral;

      store.swapEphemeralForLibrary("eph-1", library);

      expect(playerStore.currentTrack).toStrictEqual(library);
      expect(playSpy).not.toHaveBeenCalled();
    });

    it("persists the swapped entry as a library track", () => {
      const store = useQueueStore();
      const library = createTrack("lib-1", "Imported");
      seedQueueItems(store, [
        { id: "a" as any, track: createEphemeral("eph-1", "C:/x.flac"), source: { type: "manual" as const }, addedAt: 1 },
      ] as any);
      store.originalQueueOrder = ["a"] as any;
      seedCurrentIndex(store, 0);

      store.swapEphemeralForLibrary("eph-1", library);

      expect(store.persistedSnapshot?.queue[0].track).toEqual({
        kind: "library",
        trackId: library.id,
      });
    });

    it("does not touch the player when the current item is a different track", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const current = createTrack("2");
      seedQueueItems(store, [
        { id: "a" as any, track: createEphemeral("eph-1", "C:/x.flac"), source: { type: "manual" as const }, addedAt: 1 },
        { id: "b" as any, track: current, source: { type: "manual" as const }, addedAt: 2 },
      ] as any);
      seedCurrentIndex(store, 1);
      playerStore.currentTrack = current;

      store.swapEphemeralForLibrary("eph-1", createTrack("lib-1"));

      expect(playerStore.currentTrack).toStrictEqual(current);
    });
  });

  describe("computed properties", () => {
    it("should compute currentItem correctly", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      seedQueueItems(store, [
        { id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      expect(store.currentItem?.track).toStrictEqual(track);
    });

    it("should return null for currentItem when index is -1", () => {
      const store = useQueueStore();
      seedQueueItems(store, [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }]);
      seedCurrentIndex(store, -1);

      expect(store.currentItem).toBe(null);
    });

    it("should compute currentTrack correctly", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      seedQueueItems(store, [{ id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() }]);
      seedCurrentIndex(store, 0);

      expect(store.currentTrack).toStrictEqual(track);
    });

    it("should compute hasNext correctly", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      expect(store.hasNext).toBe(true);

      seedCurrentIndex(store, 1);
      expect(store.hasNext).toBe(false);

      store.repeatMode = "all";
      expect(store.hasNext).toBe(true);
    });

    it("should compute hasPrevious correctly", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "off";

      expect(store.hasPrevious).toBe(true);

      seedCurrentIndex(store, 0);
      expect(store.hasPrevious).toBe(false);

      store.repeatMode = "all";
      expect(store.hasPrevious).toBe(true);
    });

    it("should compute upcomingItems correctly", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      expect(store.upcomingItems).toHaveLength(2);
      expect(store.upcomingItems[0].track.id).toBe("2");
      expect(store.upcomingItems[1].track.id).toBe("3");
    });

    it("should compute previousItems correctly", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 2);

      expect(store.previousItems).toHaveLength(2);
      expect(store.previousItems[0].track.id).toBe("1");
      expect(store.previousItems[1].track.id).toBe("2");
    });
  });

  describe("setQueue", () => {
    it("should set queue and start playing at index", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playPlayerTrackSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const tracks = [createTrack("1"), createTrack("2")];
      await store.setQueue(tracks, 1);

      expect(store.queue).toHaveLength(2);
      expect(store.currentIndex).toBe(1);
      expect(playPlayerTrackSpy).toHaveBeenCalledWith(tracks[1]);
    });

    it("should clear queue for empty tracks array", async () => {
      const store = useQueueStore();
      seedQueueItems(store, [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }]);
      seedCurrentIndex(store, 0);

      await store.setQueue([]);

      expect(store.isEmpty).toBe(true);
      expect(store.currentIndex).toBe(-1);
    });

    it("should clear current selection when no playable tracks remain", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("missing file"));
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      await store.setQueue([createTrack("1")], 0);

      expect(store.currentIndex).toBe(-1);
      expect(stopSpy).toHaveBeenCalled();
      expect(clearCurrentTrackSpy).toHaveBeenCalled();
    });

    it("should start shuffled playback from the selected track", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playPlayerTrackSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];
      await store.setQueue(tracks, 1, { type: "album", albumId: "album-1" as Track["albumId"] }, { shuffled: true });

      expect(store.isShuffled).toBe(true);
      expect(store.currentIndex).toBe(0);
      expect(store.queue[0].track.id).toBe("2");
      expect(store.originalQueue.map(item => item.track.id)).toEqual(["1", "2", "3"]);
      expect(playPlayerTrackSpy).toHaveBeenCalledWith(tracks[1]);
    });

    it("should preserve shuffle mode for a new queue when shuffle is enabled", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedShuffled(store, true);

      const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];
      await store.setQueue(tracks, 2, { type: "playlist", playlistId: "playlist-1" as any });

      expect(store.isShuffled).toBe(true);
      expect(store.currentIndex).toBe(0);
      expect(store.queue[0].track.id).toBe("3");
    });

    it("should preserve queue item ids when rebuilding the same source", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const source = { type: "playlist", playlistId: "playlist-1" as any } as const;
      const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];

      await store.setQueue(tracks, 0, source);

      const initialIds = store.queue.map(item => item.id);

      await store.setQueue(tracks, 2, source);

      expect(store.queue.map(item => item.id)).toEqual(initialIds);
      expect(store.currentIndex).toBe(2);
    });
  });

  describe("addToQueue", () => {
    it("should add single track to queue", () => {
      const store = useQueueStore();
      const track = createTrack("1");

      store.addToQueue(track);

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track).toStrictEqual(track);
    });
  });

  describe("addMultipleToQueue", () => {
    it("should add multiple tracks to queue", () => {
      const store = useQueueStore();
      const tracks = [createTrack("1"), createTrack("2"), createTrack("3")];

      store.addMultipleToQueue(tracks);

      expect(store.queue).toHaveLength(3);
    });
  });

  describe("insertNext", () => {
    it("should insert track after current track", () => {
      const store = useQueueStore();
      const track1 = createTrack("1");
      const track2 = createTrack("2");
      const trackToInsert = createTrack("insert");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: track2, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.insertNext(trackToInsert);

      expect(store.queue[1].track).toStrictEqual(trackToInsert);
    });

    it("returns the inserted entry so the caller can jump to it", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
      await store.setQueue([createTrack("1"), createTrack("2")], 0, { type: "manual" });

      const item = store.insertNext(createTrack("9"));
      await store.jumpToId(item.id);

      expect(store.queue[1]).toBe(item);
      expect(store.currentTrack?.id).toBe("9");
      expect(playSpy).toHaveBeenLastCalledWith(createTrack("9"));
    });

    it("should insert at beginning when no current track", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      const trackToInsert = createTrack("insert");

      seedQueueItems(store, [{ id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() }]);
      seedCurrentIndex(store, -1);

      store.insertNext(trackToInsert);

      expect(store.queue[0].track).toStrictEqual(trackToInsert);
    });

    it("insertMultipleNext places all tracks after the current one, in order, in one commit", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      const inserted = store.insertMultipleNext([createTrack("a"), createTrack("b"), createTrack("c")]);

      expect(inserted).toHaveLength(3);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "a", "b", "c", "2"]);
    });

    it("insertMultipleNext with an empty list is a no-op", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      expect(store.insertMultipleNext([])).toEqual([]);
      expect(store.queue.map(item => item.track.id)).toEqual(["1"]);
    });
  });

  describe("removeFromQueue", () => {
    it("should remove track by id", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeFromQueue("item-2" as any);

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track.id).toBe("1");
    });

    it("should update currentIndex when removing item before current", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 2);

      store.removeFromQueue("item-1" as any);

      expect(store.currentIndex).toBe(1);
    });
  });

  describe("removeMultiple", () => {
    it("should remove multiple tracks by ids", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeMultiple(["item-1" as any, "item-3" as any]);

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track.id).toBe("2");
    });
  });

  describe("moveTrack", () => {
    it("should move track from one position to another", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);

      store.moveTrack(0, 2);

      expect(store.queue[0].track.id).toBe("2");
      expect(store.queue[2].track.id).toBe("1");
    });

    it("should update currentIndex when moving current track", () => {
      const store = useQueueStore();
      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.moveTrack(0, 1);

      expect(store.currentIndex).toBe(1);
    });
  });

  describe("shuffle", () => {
    it("should shuffle queue but keep current track first", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.shuffle();

      expect(store.isShuffled).toBe(true);
      expect(store.queue[0].track.id).toBe("1");
      expect(store.queue).toHaveLength(3);
    });

    it("should not shuffle if queue has 1 or fewer items", () => {
      const store = useQueueStore();
      seedQueueItems(store, [{ id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }]);

      store.shuffle();

      expect(store.isShuffled).toBe(true);
      expect(store.queue).toHaveLength(1);
    });
  });

  describe("unshuffle", () => {
    it("should restore original queue", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const tracks = [createTrack("1"), createTrack("2")];

      await store.setQueue(tracks, 0, { type: "manual" });
      store.shuffle();

      store.unshuffle();

      expect(store.isShuffled).toBe(false);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2"]);
    });
  });

  describe("clear", () => {
    it("should clear queue and reset state", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1")], 0, { type: "manual" });
      store.shuffle();

      store.clear();

      expect(store.queue).toEqual([]);
      expect(store.originalQueue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
      expect(store.isShuffled).toBe(false);
    });
  });

  describe("persistence", () => {
    it("should persist a compact queue snapshot", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1"), createTrack("2")], 1, { type: "manual" });
      await Promise.resolve();

      expect(trackRepository.findByIds).not.toHaveBeenCalled();

      expect(store.persistedSnapshot).toEqual({
        version: 1,
        queue: [
          {
            id: store.queue[0].id,
            track: { kind: "library", trackId: "1" },
            source: { type: "manual" },
            addedAt: store.queue[0].addedAt,
          },
          {
            id: store.queue[1].id,
            track: { kind: "library", trackId: "2" },
            source: { type: "manual" },
            addedAt: store.queue[1].addedAt,
          },
        ],
        originalQueueOrder: store.queue.map(item => item.id),
        currentIndex: 1,
        currentItemId: store.queue[1].id,
        isShuffled: false,
      });
    });

    it("should restore persisted queue and sync current track", async () => {
      const track1 = createTrack("1");
      const track2 = createTrack("2");

      vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([
        {
          id: track1.id,
          title: track1.title,
          artistName: track1.artist,
          albumTitle: track1.albumName,
          artistIds: track1.artistIds,
          albumId: track1.albumId,
          tagIds: [],
          source: track1.source,
          storagePath: track1.storagePath,
          state: track1.state,
          duration: track1.duration,
          format: {},
          playCount: track1.playCount ?? 0,
          addedAt: track1.addedAt ?? 0,
          likedAt: track1.isLiked ? Date.now() : undefined,
        },
        {
          id: track2.id,
          title: track2.title,
          artistName: track2.artist,
          albumTitle: track2.albumName,
          artistIds: track2.artistIds,
          albumId: track2.albumId,
          tagIds: [],
          source: track2.source,
          storagePath: track2.storagePath,
          state: track2.state,
          duration: track2.duration,
          format: {},
          playCount: track2.playCount ?? 0,
          addedAt: track2.addedAt ?? 0,
          likedAt: track2.isLiked ? Date.now() : undefined,
        },
      ]));

      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [
          {
            id: "item-1",
            track: { kind: "library", trackId: "1" },
            source: { type: "manual" },
            addedAt: 100,
          },
          {
            id: "item-2",
            track: { kind: "library", trackId: "2" },
            source: { type: "manual" },
            addedAt: 200,
          },
        ],
        originalQueueOrder: ["item-1", "item-2"],
        currentIndex: 1,
        isShuffled: false,
      };

      const clearSpy = vi.spyOn(playerStore, "clearCurrentTrack");
      await store.restorePersistedQueue();

      expect(trackRepository.findByIds).toHaveBeenCalledWith(["1", "2"]);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2"]);
      expect(store.currentIndex).toBe(1);
      // Restore hands the player the entry to show without loading it and
      // never clears anything on it.
      expect(playerStore.currentTrack?.id).toBe("2");
      expect(clearSpy).not.toHaveBeenCalled();
    });
  });

  describe("syncTrackMetadata", () => {
    it("should update track metadata in queue", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const track1 = createTrack("1");
      const track2 = createTrack("2");

      await store.setQueue([track1, track2], 0, { type: "manual" });

      store.syncTrackMetadata({ ...track1, lyricsPath: "lyrics/1.lrc" } as Track);

      expect((store.queue[0].track as Track).lyricsPath).toBe("lyrics/1.lrc");
      expect((store.originalQueue[0].track as Track).lyricsPath).toBe("lyrics/1.lrc");
    });

    it("patches the player's current track when it is the edited one", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const track1 = createTrack("1");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.currentTrack = track1;

      store.syncTrackMetadata({ ...track1, title: "Renamed" } as Track);

      expect(playerStore.currentTrack?.title).toBe("Renamed");
      expect(store.currentTrack?.title).toBe("Renamed");
    });

    it("leaves the player's current track alone when another track is edited", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const track1 = createTrack("1");
      const track2 = createTrack("2");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: track2, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.currentTrack = track1;

      store.syncTrackMetadata({ ...track2, title: "Renamed" } as Track);

      expect(playerStore.currentTrack?.title).toBe(track1.title);
      expect(store.queue[1].track.title).toBe("Renamed");
    });
  });

  describe("syncTracksMetadata", () => {
    it("patches every listed track in one commit and leaves the rest alone", () => {
      const store = useQueueStore();
      const track1 = createTrack("1");
      const track2 = createTrack("2");
      const track3 = createTrack("3");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: track2, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-3" as any, track: track3, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 2);

      const before = store.queue;

      store.syncTracksMetadata([
        { ...track1, isLiked: true, title: "Renamed 1" } as Track,
        { ...track2, isLiked: true, title: "Renamed 2" } as Track,
      ]);

      expect((store.queue[0].track as Track).isLiked).toBe(true);
      expect(store.queue[0].track.title).toBe("Renamed 1");
      expect((store.queue[1].track as Track).isLiked).toBe(true);
      expect(store.queue[1].track.title).toBe("Renamed 2");
      expect((store.queue[2].track as Track).isLiked).toBe(false);
      expect(store.queue[2].track.title).toBe(track3.title);
      expect(store.queue).not.toBe(before);
      expect(store.queue[2]).toBe(before[2]);
    });

    it("hands the patched current track to the player once", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const presentSpy = vi.spyOn(playerStore, "presentTrack");
      const track1 = createTrack("1");
      const track2 = createTrack("2");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: track2, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.syncTracksMetadata([
        { ...track1, isLiked: true } as Track,
        { ...track2, isLiked: true } as Track,
      ]);

      expect(presentSpy).toHaveBeenCalledTimes(1);
      expect((store.currentTrack as Track).isLiked).toBe(true);
    });

    it("is a no-op for an empty list and for ephemeral-only tracks", () => {
      const store = useQueueStore();
      const track1 = createTrack("1");

      seedQueueItems(store, [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      const before = store.queue;

      store.syncTracksMetadata([]);
      expect(store.queue).toBe(before);

      store.syncTracksMetadata([
        { kind: "ephemeral", id: "1", title: "Eph", source: { type: "url", url: "https://example.com/a.mp3" } } as any,
      ]);
      expect(store.queue).toBe(before);
      expect(store.queue[0].track.title).toBe(track1.title);
    });
  });

  describe("jumpTo", () => {
    it("should jump to specific index and play", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      await store.jumpTo(1);

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });
  });

  describe("jumpToId", () => {
    it("should jump to track by id", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      await store.jumpToId("item-2" as any);

      expect(store.currentIndex).toBe(1);
    });

    it("should do nothing when id not found", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      await store.jumpToId("non-existent-id" as any);

      expect(playSpy).not.toHaveBeenCalled();
      expect(store.currentIndex).toBe(0);
    });
  });

  describe("next", () => {
    it("should go to next track when not at end", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should restart current track in repeat-one mode when it ends", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "one";

      await store.advance();

      expect(store.currentIndex).toBe(0);
      expect(store.repeatMode).toBe("one");
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("next() in repeat-one mode falls back to repeat-all and plays the next track", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "one";

      await store.next();

      expect(store.repeatMode).toBe("all");
      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("next() in repeat-one mode on the last track wraps like repeat-all", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "one";

      await store.next();

      expect(store.repeatMode).toBe("all");
      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should loop to start in repeat-all mode", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "all";

      await store.next();

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should stop when at end with repeat off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(-1);
      expect(stopSpy).toHaveBeenCalled();
    });

    it("should append and play recommendations when queue ends with repeat off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
      const recommendations = [
        createTrackEntity("rec-1", "Recommended 1"),
        createTrackEntity("rec-2", "Recommended 2"),
        createTrackEntity("rec-3", "Recommended 3"),
        createTrackEntity("rec-4", "Recommended 4"),
        createTrackEntity("rec-5", "Recommended 5"),
      ];
      vi.mocked(getRecommendations).mockResolvedValue(recommendations.map(createRecommendation));

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      await store.next();

      expect(getRecommendations).toHaveBeenCalledWith(createTrack("1").id, 5, []);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "rec-1", "rec-2", "rec-3", "rec-4", "rec-5"]);
      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-1", kind: "library" }));
    });

    it("leaves the track the user started alone when a slow lookup finishes late", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      // The lookup is held open until the user has acted.
      let releaseRecommendations!: () => void;
      vi.mocked(getRecommendations).mockReturnValue(new Promise((resolve) => {
        releaseRecommendations = () => resolve([]);
      }));

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "off";

      // The tail track ended. player-lifecycle fires advance() off the
      // trackEnded bus and does not await it.
      const advancing = store.advance();

      // Meanwhile the user picks another track and it starts playing.
      await store.jumpTo(0);
      expect(store.currentIndex).toBe(0);

      releaseRecommendations();
      await advancing;

      expect(store.currentIndex).toBe(0);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(clearCurrentTrackSpy).not.toHaveBeenCalled();
    });

    it("leaves a replayed tail track alone when a slow lookup finishes late", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      let releaseRecommendations!: () => void;
      vi.mocked(getRecommendations).mockReturnValue(new Promise((resolve) => {
        releaseRecommendations = () => resolve([]);
      }));

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      store.repeatMode = "off";

      const advancing = store.advance();

      // The user replays the entry that just ended: the selection lands on
      // the same id, so identity alone cannot tell this from "nothing
      // happened".
      await store.jumpTo(1);
      expect(store.currentIndex).toBe(1);

      releaseRecommendations();
      await advancing;

      expect(store.currentIndex).toBe(1);
      expect(stopSpy).not.toHaveBeenCalled();
      expect(clearCurrentTrackSpy).not.toHaveBeenCalled();
    });

    it("should do nothing when queue is empty", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, []);
      seedCurrentIndex(store, -1);

      await store.next();

      expect(playSpy).not.toHaveBeenCalled();
    });

    it("should clear current selection when last track cannot play", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("missing file"));
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(-1);
      expect(stopSpy).toHaveBeenCalled();
      expect(clearCurrentTrackSpy).toHaveBeenCalled();
    });
  });

  describe("previous", () => {
    it("should go to previous track when not at start", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);
      playerStore.currentTime = 1;

      await store.previous();

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should restart current track when currentTime > RESTART_THRESHOLD", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const seekSpy = vi.spyOn(playerStore, "seekTo").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.currentTime = 5;
      // A seekable track: the restart-at-zero branch requires canSeek.
      playerStore.player = {} as any;
      playerStore.duration = 120;

      await store.previous();

      expect(seekSpy).toHaveBeenCalledWith(0);
    });

    it("should loop to end in repeat-all mode", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.currentTime = 1;
      store.repeatMode = "all";

      await store.previous();

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should seek to 0 when at start with repeat off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const seekSpy = vi.spyOn(playerStore, "seekTo").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.currentTime = 1;
      store.repeatMode = "off";

      await store.previous();

      expect(seekSpy).toHaveBeenCalledWith(0);
    });

    it("should do nothing when queue is empty", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, []);

      await store.previous();

      expect(playSpy).not.toHaveBeenCalled();
    });
  });

  describe("toggleShuffle", () => {
    it("should shuffle when not shuffled", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      seedShuffled(store, false);

      store.toggleShuffle();

      expect(store.isShuffled).toBe(true);
    });

    it("should unshuffle when already shuffled", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedShuffled(store, true);

      store.toggleShuffle();

      expect(store.isShuffled).toBe(false);
    });

    it("should restore the original order while keeping the current track selected", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1"), createTrack("2"), createTrack("3")], 1, { type: "manual" });

      store.toggleShuffle();

      store.toggleShuffle();

      expect(store.isShuffled).toBe(false);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2", "3"]);
      expect(store.currentIndex).toBe(1);
    });

    it("should keep appended tracks after turning shuffle off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1"), createTrack("2"), createTrack("3")], 1, { type: "manual" });

      store.toggleShuffle();
      store.addToQueue(createTrack("4"));
      store.toggleShuffle();

      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2", "3", "4"]);
      expect(store.currentTrack?.id).toBe("2");
      expect(store.currentIndex).toBe(1);
    });

    it("should keep insert-next ordering after turning shuffle off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1"), createTrack("2"), createTrack("3")], 1, { type: "manual" });

      store.toggleShuffle();
      store.insertNext(createTrack("99"));
      store.toggleShuffle();

      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2", "99", "3"]);
      expect(store.currentTrack?.id).toBe("2");
      expect(store.currentIndex).toBe(1);
    });

    it("should not restore removed tracks after turning shuffle off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      await store.setQueue([createTrack("1"), createTrack("2"), createTrack("3")], 1, { type: "manual" });

      store.toggleShuffle();

      const removedItem = store.queue.find(item => item.track.id === "1");
      expect(removedItem).toBeDefined();

      store.removeFromQueue(removedItem!.id);
      store.toggleShuffle();

      expect(store.queue.map(item => item.track.id)).toEqual(["2", "3"]);
      expect(store.currentTrack?.id).toBe("2");
      expect(store.currentIndex).toBe(0);
    });
  });

  describe("removeFromQueue edge cases", () => {
    it("should stop player when removing last item", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeFromQueue("item-1" as any);

      expect(stopSpy).toHaveBeenCalled();
      expect(store.currentIndex).toBe(-1);
    });

    it("should update currentIndex when removing after current", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeFromQueue("item-2" as any);

      expect(store.currentIndex).toBe(0);
    });

    it("should play next when removing current", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      playerStore.playbackState = { kind: "playing" };

      store.removeFromQueue("item-1" as any);

      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should do nothing when id not found", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeFromQueue("non-existent" as any);

      expect(store.queue).toHaveLength(1);
      expect(stopSpy).not.toHaveBeenCalled();
    });
  });

  describe("removeMultiple edge cases", () => {
    it("should stop player when all items removed", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.removeMultiple(["item-1" as any]);

      expect(stopSpy).toHaveBeenCalled();
      expect(store.currentIndex).toBe(-1);
    });

    it("should recalculate index after removal", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);

      store.removeMultiple(["item-1" as any]);

      expect(store.currentIndex).toBe(0);
    });
  });

  describe("moveTrack edge cases", () => {
    it("should do nothing when fromIndex equals toIndex", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.moveTrack(0, 0);

      expect(store.queue[0].track.id).toBe("1");
    });

    it("should decrement index when moving item before current", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 2);

      store.moveTrack(0, 2);

      expect(store.currentIndex).toBe(1);
    });

    it("should increment index when moving item after current", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.moveTrack(2, 0);

      expect(store.currentIndex).toBe(1);
    });

    it("should do nothing for invalid indices", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);

      store.moveTrack(-1, 0);
      expect(store.queue[0].track.id).toBe("1");

      store.moveTrack(0, 10);
      expect(store.queue[0].track.id).toBe("1");
    });
  });

  describe("shuffle edge cases", () => {
    it("should save original queue on first shuffle", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      store.shuffle();

      expect(store.originalQueue).toHaveLength(2);
    });
  });

  describe("unshuffle edge cases", () => {
    it("should do nothing when not shuffled", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedShuffled(store, false);

      store.unshuffle();

      expect(store.queue[0].track.id).toBe("1");
    });

    it("should do nothing when original queue is empty", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedShuffled(store, true);

      store.unshuffle();

      expect(store.isShuffled).toBe(false);
      expect(store.queue[0].track.id).toBe("1");
    });
  });

  describe("computed properties edge cases", () => {
    it("should return null when currentIndex out of bounds", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 5);

      expect(store.currentItem).toBe(null);
      expect(store.currentTrack).toBe(null);
    });

    it("should return all items when currentIndex is -1", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, -1);

      expect(store.upcomingItems).toHaveLength(2);
      expect(store.previousItems).toHaveLength(0);
    });

    it("should return empty array for previousItems when at start", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      expect(store.previousItems).toHaveLength(0);
      expect(store.upcomingItems).toHaveLength(1);
    });

    it("should return true for hasNext with repeat all even at end", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "all";

      expect(store.hasNext).toBe(true);
    });

    it("should return true for hasPrevious with repeat all even at start", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "all";

      expect(store.hasPrevious).toBe(true);
    });

    it("should return false for hasNext when queue is empty", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, []);
      store.repeatMode = "all";

      expect(store.hasNext).toBe(false);
    });

    it("should return false for hasPrevious when queue is empty", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      seedQueueItems(store, []);
      store.repeatMode = "all";

      expect(store.hasPrevious).toBe(false);
    });
  });

  describe("removeMultiple — current not removed", () => {
    it("should recalculate currentIndex when current item stays", () => {
      const store = useQueueStore();

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 1);

      store.removeMultiple(["item-3"] as any);

      expect(store.currentIndex).toBe(1);
      expect(store.queue.map(i => i.track.id)).toEqual(["1", "2"]);
    });

    it("should fall back to index 0 when current item not found after removal", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      seedQueueItems(store, []);

      store.removeMultiple(["item-1"] as any);

      expect(store.currentIndex).toBe(-1);
    });
  });

  describe("queue audit fixes", () => {
    const seedQueue = (store: ReturnType<typeof useQueueStore>, ids: string[], current = -1) => {
      seedQueueItems(store, ids.map(id => ({
        id: `item-${id}` as any,
        track: createTrack(id),
        source: { type: "manual" as const },
        addedAt: Date.now(),
      })));
      seedCurrentIndex(store, current);
    };

    describe("restore vs early user actions", () => {
      it("aborts the restore commit when the queue was mutated during the DB read", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

        let resolveDb!: (value: unknown) => void;
        vi.mocked(trackRepository.findByIds).mockImplementationOnce(
          () => new Promise((resolve) => { resolveDb = resolve; }) as any,
        );

        store.persistedSnapshot = {
          version: 1,
          queue: [{ id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 }],
          originalQueueOrder: ["item-1"],
          currentIndex: 0,
          isShuffled: false,
        };

        const restoring = store.restorePersistedQueue();
        // The user starts their own playback while the snapshot's DB read is
        // still in flight (open-with launch, an early click).
        await store.setQueue([createTrack("9")], 0, { type: "manual" });
        // The real playPlayerTrack is mocked out — assign what it would have.
        playerStore.currentTrack = createTrack("9");

        resolveDb(ok([createTrackEntity("1")]));
        await restoring;

        expect(store.queue.map(item => item.track.id)).toEqual(["9"]);
        expect(playerStore.currentTrack?.id).toBe("9");
      });

      it("leaves the player alone when playback is already active at commit time", async () => {
        vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([createTrackEntity("1")]));
        const store = useQueueStore();
        const playerStore = usePlayerStore();

        // Playback started outside the queue (cold play of the persisted track).
        playerStore.currentTrack = createTrack("9");
        playerStore.playbackState = { kind: "playing" };

        store.persistedSnapshot = {
          version: 1,
          queue: [{ id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 }],
          originalQueueOrder: ["item-1"],
          currentIndex: 0,
          isShuffled: false,
        };

        await store.restorePersistedQueue();

        expect(store.queue).toHaveLength(1);
        expect(playerStore.currentTrack?.id).toBe("9");
      });
    });

    describe("restore failure resilience", () => {
      it("keeps the stored snapshot when the repository read fails", async () => {
        vi.mocked(trackRepository.findByIds).mockRejectedValue(new Error("DB error"));

        const store = useQueueStore();
        store.persistedSnapshot = {
          version: 1,
          queue: [{ id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 }],
          originalQueueOrder: ["item-1"],
          currentIndex: 0,
          isShuffled: false,
        };

        await store.restorePersistedQueue();

        expect(store.queue).toEqual([]);
        expect(store.currentIndex).toBe(-1);
        // A transient infrastructure failure must not wipe the stored queue —
        // the next healthy launch should still be able to restore it.
        expect(store.persistedSnapshot).not.toBeNull();
      });

      it("does not touch state for an unknown snapshot version", async () => {
        const store = useQueueStore();
        store.persistedSnapshot = {
          version: 2,
          queue: [],
          originalQueueOrder: [],
          currentIndex: -1,
          isShuffled: false,
        } as any;

        await store.restorePersistedQueue();

        expect(trackRepository.findByIds).not.toHaveBeenCalled();
        expect(store.persistedSnapshot).not.toBeNull();
      });
    });

    describe("restore current item by id", () => {
      it("keeps the same current track when earlier tracks vanished from the library", async () => {
        vi.mocked(trackRepository.findByIds).mockResolvedValue(
          ok([createTrackEntity("2"), createTrackEntity("3")]),
        );
        const store = useQueueStore();
        const playerStore = usePlayerStore();

        store.persistedSnapshot = {
          version: 1,
          queue: [
            { id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 },
            { id: "item-2", track: { kind: "library", trackId: "2" }, source: { type: "manual" }, addedAt: 200 },
            { id: "item-3", track: { kind: "library", trackId: "3" }, source: { type: "manual" }, addedAt: 300 },
          ],
          originalQueueOrder: ["item-1", "item-2", "item-3"],
          currentIndex: 2,
          currentItemId: "item-3",
          isShuffled: false,
        } as any;

        await store.restorePersistedQueue();

        expect(store.queue.map(item => item.track.id)).toEqual(["2", "3"]);
        expect(store.currentIndex).toBe(1);
        expect(playerStore.currentTrack?.id).toBe("3");
      });

      it("persists the current item id in the snapshot", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

        await store.setQueue([createTrack("1"), createTrack("2")], 1, { type: "manual" });

        expect((store.persistedSnapshot as any)?.currentItemId).toBe(store.queue[1].id);
      });
    });

    describe("removeMultiple index arithmetic", () => {
      it("plays the correct successor when removing current plus items above it", () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1", "2", "3", "4", "5"], 2);
        playerStore.playbackState = { kind: "playing" };

        store.removeMultiple(["item-1", "item-3"] as any);

        expect(store.queue.map(item => item.track.id)).toEqual(["2", "4", "5"]);
        expect(playSpy).toHaveBeenCalledWith(createTrack("4"));
      });
    });

    describe("insertNext order sync", () => {
      it("keeps originalQueueOrder aligned when inserting with no current track", () => {
        const store = useQueueStore();
        store.addToQueue(createTrack("1"));
        store.addToQueue(createTrack("2"));
        seedCurrentIndex(store, -1);

        store.insertNext(createTrack("9"));

        expect(store.queue.map(item => item.track.id)).toEqual(["9", "1", "2"]);
        expect(store.originalQueue.map(item => item.track.id)).toEqual(["9", "1", "2"]);
      });
    });

    describe("previous on unseekable tracks", () => {
      it("goes to the previous track when the current one cannot seek", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1", "2"], 1);

        // Live stream: the position advances but seeking is impossible, so
        // the restart-at-zero branch must not swallow the button press.
        playerStore.currentTime = 50;
        playerStore.duration = 0;

        await store.previous();

        expect(store.currentIndex).toBe(0);
        expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
      });
    });

    describe("repeat-one restart failures", () => {
      it("restarts with a single call — retrying a transient failure is the player's job", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1"], 0);
        store.repeatMode = "one";

        await store.advance();

        expect(playSpy).toHaveBeenCalledTimes(1);
        expect(store.currentIndex).toBe(0);
      });

      it("resets the selection when the restart fails", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack")
          .mockRejectedValue(new Error("dead"));
        seedQueue(store, ["1"], 0);
        store.repeatMode = "one";

        await store.advance();

        expect(playSpy).toHaveBeenCalledTimes(1);
        expect(store.currentIndex).toBe(-1);
      });
    });

    describe("repeat-one restarts on the loaded media", () => {
      it("rewinds the current track instead of resolving and loading it again", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const restartSpy = vi.spyOn(playerStore, "restartCurrent").mockResolvedValue(true);
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1", "2"], 0);
        store.repeatMode = "one";

        await store.advance();

        expect(restartSpy).toHaveBeenCalledTimes(1);
        expect(playSpy).not.toHaveBeenCalled();
        expect(store.currentIndex).toBe(0);
      });

      it("falls back to the full load path when the engine holds no media", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        vi.spyOn(playerStore, "restartCurrent").mockResolvedValue(false);
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1"], 0);
        store.repeatMode = "one";

        await store.advance();

        expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
      });
    });

    describe("skipping unplayable entries cheaply", () => {
      it("passes over a track flagged broken without selecting or loading it", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        const selected: (string | undefined)[] = [];
        watch(() => store.currentTrack?.id, id => selected.push(id));
        seedQueueItems(store, [
          { id: "item-1" as any, track: { ...createTrack("1"), state: TrackState.BROKEN }, source: { type: "manual" }, addedAt: Date.now() },
          { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        ]);
        seedCurrentIndex(store, -1);

        await store.next();
        await nextTick();

        expect(playSpy).toHaveBeenCalledTimes(1);
        expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
        expect(selected).toEqual(["2"]);
      });

      it("stops after ten consecutive skips instead of draining a long queue of missing files", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockImplementation(
          async track => { throw new PlaybackFailure({ kind: "unavailable", reason: "gone" }, track); },
        );
        const stalled = vi.fn();
        const skipped = vi.fn();
        const offStalled = useEventBus(playbackStalledEvent).on(stalled);
        const offSkipped = useEventBus(trackSkippedEvent).on(skipped);
        seedQueue(store, Array.from({ length: 30 }, (_, i) => String(i + 1)), -1);

        await store.next();

        expect(playSpy).toHaveBeenCalledTimes(10);
        expect(skipped).toHaveBeenCalledTimes(10);
        expect(stalled).toHaveBeenCalledTimes(1);
        expect(stalled.mock.calls[0][0]).toMatchObject({ failures: 10 });
        expect(stopSpy).toHaveBeenCalled();
        expect(store.currentIndex).toBe(-1);
        offStalled();
        offSkipped();
      });
    });

    describe("removing the current entry", () => {
      it("plays the successor while playback is on", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        seedQueue(store, ["1", "2", "3"], 0);
        playerStore.playbackState = { kind: "playing" };

        await store.removeFromQueue("item-1" as any);

        expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
        expect(store.currentTrack?.id).toBe("2");
      });

      it("only selects the successor while paused", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
        const selectSpy = vi.spyOn(playerStore, "selectTrack").mockReturnValue(undefined);
        seedQueue(store, ["1", "2", "3"], 1);
        playerStore.playbackState = { kind: "paused" };

        await store.removeFromQueue("item-2" as any);

        expect(playSpy).not.toHaveBeenCalled();
        expect(selectSpy).toHaveBeenCalledWith(createTrack("3"));
        expect(store.currentTrack?.id).toBe("3");
      });

      it("selects the new last entry when the paused tail is removed", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const selectSpy = vi.spyOn(playerStore, "selectTrack").mockReturnValue(undefined);
        seedQueue(store, ["1", "2", "3"], 2);
        playerStore.playbackState = { kind: "paused" };

        await store.removeFromQueue("item-3" as any);

        expect(selectSpy).toHaveBeenCalledWith(createTrack("2"));
        expect(store.currentIndex).toBe(1);
      });
    });

    describe("failures by kind", () => {
      const failWith = (error: unknown) => {
        const playerStore = usePlayerStore();
        return vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(error);
      };
      const listen = () => {
        const skipped = vi.fn();
        const stalled = vi.fn();
        const offSkipped = useEventBus(trackSkippedEvent).on(skipped);
        const offStalled = useEventBus(playbackStalledEvent).on(stalled);
        return { skipped, stalled, off: () => { offSkipped(); offStalled(); } };
      };

      it("skips a broken track silently and plays the next one", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack")
          .mockRejectedValueOnce(new PlaybackFailure({ kind: "broken", trackId: "1" }, createTrack("1")))
          .mockResolvedValue(undefined);
        const events = listen();
        seedQueue(store, ["1", "2", "3"], -1);

        await store.next();

        expect(playSpy).toHaveBeenCalledTimes(2);
        expect(store.currentTrack?.id).toBe("2");
        expect(events.skipped).not.toHaveBeenCalled();
        events.off();
      });

      it("announces a skipped unavailable track", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        vi.spyOn(playerStore, "playPlayerTrack")
          .mockRejectedValueOnce(new PlaybackFailure({ kind: "unavailable", reason: "no FS" }, createTrack("1")))
          .mockResolvedValue(undefined);
        const events = listen();
        seedQueue(store, ["1", "2"], -1);

        await store.next();

        expect(events.skipped).toHaveBeenCalledTimes(1);
        expect(events.skipped.mock.calls[0][0]).toMatchObject({
          track: { id: "1" },
          error: { kind: "unavailable", reason: "no FS" },
        });
        expect(store.currentTrack?.id).toBe("2");
        events.off();
      });

      it("stops the queue after three transient failures in a row instead of draining it", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
        const playSpy = failWith(new PlaybackFailure({ kind: "source", cause: { kind: "NETWORK", message: "down" } }, createTrack("x")));
        const events = listen();
        seedQueue(store, ["1", "2", "3", "4", "5"], -1);

        await store.next();

        expect(playSpy).toHaveBeenCalledTimes(3);
        expect(events.skipped).toHaveBeenCalledTimes(3);
        expect(events.stalled).toHaveBeenCalledTimes(1);
        expect(events.stalled.mock.calls[0][0]).toMatchObject({ failures: 3, error: { kind: "source" } });
        expect(stopSpy).toHaveBeenCalled();
        expect(store.currentIndex).toBe(-1);
        events.off();
      });

      it("counts transient failures across calls and resets the count on success", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const engineFailure = () => new PlaybackFailure({ kind: "engine", cause: new Error("x") }, createTrack("x"));
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack")
          .mockRejectedValueOnce(engineFailure())
          .mockRejectedValueOnce(engineFailure())
          .mockResolvedValueOnce(undefined)
          .mockRejectedValueOnce(engineFailure())
          .mockRejectedValueOnce(engineFailure())
          .mockResolvedValue(undefined);
        const events = listen();
        seedQueue(store, ["1", "2", "3", "4", "5", "6"], -1);

        await store.next(); // 1 fails, 2 fails, 3 plays — the run is broken
        await store.next(); // 4 fails, 5 fails, 6 plays — still no stall

        expect(playSpy).toHaveBeenCalledTimes(6);
        expect(events.stalled).not.toHaveBeenCalled();
        expect(store.currentTrack?.id).toBe("6");
        events.off();
      });

      it("removing the current entry skips past an unplayable successor", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        const playSpy = vi.spyOn(playerStore, "playPlayerTrack")
          .mockRejectedValueOnce(new PlaybackFailure({ kind: "broken", trackId: "2" }, createTrack("2")))
          .mockResolvedValue(undefined);
        seedQueue(store, ["1", "2", "3"], 0);
        playerStore.playbackState = { kind: "playing" };

        await store.removeFromQueue("item-1" as any);

        expect(playSpy).toHaveBeenCalledTimes(2);
        expect(store.currentTrack?.id).toBe("3");
      });

      it("reports a failed jump without moving on", async () => {
        const store = useQueueStore();
        const playerStore = usePlayerStore();
        failWith(new PlaybackFailure({ kind: "unavailable", reason: "no FS" }, createTrack("2")));
        const events = listen();
        seedQueue(store, ["1", "2", "3"], 0);

        await store.jumpTo(1);

        expect(events.skipped).toHaveBeenCalledTimes(1);
        expect(store.currentIndex).toBe(1);
        events.off();
      });
    });
  });

  describe("canonical model: one set of items, two orders", () => {
    const ids = (list: { track: { id: string } }[]) => list.map(item => item.track.id);
    // The playback order is a permutation of the original order: same items,
    // same count, whatever the order.
    const expectSameItems = (store: ReturnType<typeof useQueueStore>) => {
      expect(store.queue).toHaveLength(store.originalQueue.length);
      expect(new Set(ids(store.queue))).toEqual(new Set(ids(store.originalQueue)));
    };

    const seeded = async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);
      await store.setQueue([createTrack("1"), createTrack("2"), createTrack("3"), createTrack("4")], 1, { type: "manual" });
      return store;
    };

    it("keeps both orders in step through every mutation while shuffled", async () => {
      const store = await seeded();
      store.shuffle();
      expectSameItems(store);

      store.addToQueue(createTrack("5"));
      expectSameItems(store);
      store.addMultipleToQueue([createTrack("6"), createTrack("7")]);
      expectSameItems(store);
      store.insertNext(createTrack("8"));
      expectSameItems(store);
      store.moveTrack(1, 3);
      expectSameItems(store);
      store.removeFromQueue(store.queue[store.queue.length - 1].id);
      expectSameItems(store);
      store.removeMultiple([store.queue[2].id, store.queue[3].id]);
      expectSameItems(store);

      // Everything queued after the shuffle comes back in the order it was
      // added, relative to the original order.
      store.unshuffle();
      expect(ids(store.queue)).toEqual(ids(store.originalQueue));
      expect(store.currentTrack?.id).toBe("2");
    });

    it("reorders only the visible order while shuffled, and only the original order while not", async () => {
      const store = await seeded();
      store.shuffle();
      const originalBefore = ids(store.originalQueue);

      store.moveTrack(1, 3);
      expect(ids(store.originalQueue)).toEqual(originalBefore);

      store.unshuffle();
      store.moveTrack(0, 3);
      expect(ids(store.queue)).toEqual(["2", "3", "4", "1"]);
      expect(ids(store.originalQueue)).toEqual(["2", "3", "4", "1"]);
    });

    it("keeps the current item by identity when items before it are removed or moved", async () => {
      const store = await seeded();
      const current = store.currentItem!;

      store.removeFromQueue(store.queue[0].id);
      expect(store.currentItem).toBe(current);
      expect(store.currentIndex).toBe(0);

      store.addToQueue(createTrack("5"));
      store.moveTrack(3, 0);
      expect(store.currentItem).toBe(current);
      expect(store.currentIndex).toBe(1);
    });

    it("survives a shuffle → insertNext → add → remove → unshuffle round-trip", async () => {
      const store = await seeded();
      store.shuffle();
      store.insertNext(createTrack("9"));
      store.addToQueue(createTrack("5"));
      store.removeFromQueue(store.queue.find(item => item.track.id === "4")!.id);
      store.unshuffle();

      expect(ids(store.queue)).toEqual(["1", "2", "9", "3", "5"]);
      expect(store.currentTrack?.id).toBe("2");
    });

    it("persists the derived orders, not a second copy of them", async () => {
      const store = await seeded();
      store.shuffle();
      store.insertNext(createTrack("9"));

      const snapshot = store.persistedSnapshot!;
      expect(snapshot.isShuffled).toBe(true);
      expect(snapshot.queue.map(item => item.id)).toEqual(store.queue.map(item => item.id));
      expect(snapshot.originalQueueOrder).toEqual(store.originalQueue.map(item => item.id));
      expect(snapshot.currentItemId).toBe(store.currentItem!.id);
      expect(snapshot.currentIndex).toBe(store.currentIndex);
    });

    it("keeps the persisted snapshot in step with every mutation without a manual sync", async () => {
      const store = await seeded();
      const expectSnapshotMatches = () => {
        const snapshot = store.persistedSnapshot!;
        expect(snapshot.queue.map(item => item.id)).toEqual(store.queue.map(item => item.id));
        expect(snapshot.originalQueueOrder).toEqual(store.originalQueue.map(item => item.id));
        expect(snapshot.currentItemId).toBe(store.currentItem?.id);
        expect(snapshot.isShuffled).toBe(store.isShuffled);
      };

      store.addToQueue(createTrack("5"));
      expectSnapshotMatches();
      store.moveTrack(0, 2);
      expectSnapshotMatches();
      store.shuffle();
      expectSnapshotMatches();
      store.insertNext(createTrack("6"));
      expectSnapshotMatches();
      store.removeFromQueue(store.queue[2].id);
      expectSnapshotMatches();
      store.syncTrackMetadata({ ...createTrack("5"), title: "Renamed" });
      expectSnapshotMatches();
      store.unshuffle();
      expectSnapshotMatches();
      await store.jumpTo(0);
      expectSnapshotMatches();
    });

    it("keeps the persisted snapshot out of deep reactivity", async () => {
      // Every store subscriber (the persist plugin, devtools) deep-walks the
      // state on each mutation; a reactive snapshot makes that walk — and
      // the JSON.stringify behind it — cost a proxy trap per field of every
      // entry, so a skip on a long queue turned into a long task.
      const store = await seeded();
      await store.jumpTo(1);

      const snapshot = store.persistedSnapshot!;
      expect(isReactive(snapshot)).toBe(false);
      expect(isReactive(snapshot.queue)).toBe(false);
      expect(isReactive(snapshot.queue[0])).toBe(false);

      let walked = 0;
      const stop = watch(
        () => store.persistedSnapshot,
        () => {},
        {
          deep: true,
          onTrack: () => {
            walked++;
          },
        },
      );
      await store.jumpTo(0);
      await nextTick();
      stop();
      // Only the ref itself is tracked, not a dependency per entry field.
      expect(walked).toBeLessThan(10);
    });

    it("an empty shuffle is still a shuffle, and is persisted as one", () => {
      const store = useQueueStore();

      store.shuffle();

      expect(store.isShuffled).toBe(true);
      store.addToQueue(createTrack("1"));
      expect(store.persistedSnapshot?.isShuffled).toBe(true);
    });

    it("restores a shuffled snapshot with both orders, keeping entries the original order forgot", async () => {
      vi.mocked(trackRepository.findByIds).mockResolvedValue(
        ok([createTrackEntity("1"), createTrackEntity("2"), createTrackEntity("3")]),
      );
      const store = useQueueStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [
          { id: "item-2", track: { kind: "library", trackId: "2" }, source: { type: "manual" }, addedAt: 200 },
          { id: "item-3", track: { kind: "library", trackId: "3" }, source: { type: "manual" }, addedAt: 300 },
          { id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 },
        ],
        // item-3 was appended by a build that did not mirror it here.
        originalQueueOrder: ["item-1", "item-2"],
        currentIndex: 0,
        currentItemId: "item-2",
        isShuffled: true,
      } as any;

      await store.restorePersistedQueue();

      expect(store.isShuffled).toBe(true);
      expect(store.queue.map(item => item.id)).toEqual(["item-2", "item-3", "item-1"]);
      expect(store.originalQueue.map(item => item.id)).toEqual(["item-1", "item-2", "item-3"]);
      expect(store.currentIndex).toBe(0);

      store.unshuffle();
      expect(store.queue.map(item => item.id)).toEqual(["item-1", "item-2", "item-3"]);
      expect(store.currentItem?.id).toBe("item-2");
    });

    it("drops a stale current id that is not in the restored queue", async () => {
      vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([createTrackEntity("1")]));
      const store = useQueueStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [
          { id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 },
          { id: "item-2", track: { kind: "library", trackId: "2" }, source: { type: "manual" }, addedAt: 200 },
        ],
        originalQueueOrder: ["item-1", "item-2"],
        currentIndex: 1,
        currentItemId: "item-2",
        isShuffled: false,
      } as any;

      await store.restorePersistedQueue();

      expect(store.queue.map(item => item.id)).toEqual(["item-1"]);
      expect(store.currentIndex).toBe(-1);
    });
  });

  describe("repeatMode", () => {
    it("cycles off → all → one → off", () => {
      const store = useQueueStore();

      expect(store.repeatMode).toBe("off");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("all");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("one");
      store.toggleRepeat();
      expect(store.repeatMode).toBe("off");
    });

    // Pinia only activates plugins once it is installed on an app.
    const hydratedStore = () => {
      const pinia = createPinia();
      pinia.use(piniaPluginPersistedstate);
      createApp({ render: () => null }).use(pinia);
      setActivePinia(pinia);
      return useQueueStore();
    };

    it("persists under the queue key and no longer under the player's", async () => {
      const store = hydratedStore();

      store.toggleRepeat();
      await nextTick();
      // Writes are debounced; hiding the page flushes them.
      window.dispatchEvent(new Event("pagehide"));

      expect(JSON.parse(localStorage.getItem("audiogram-queue-v1")!).repeatMode).toBe("all");
      expect(JSON.parse(localStorage.getItem("lyra-player") ?? "{}").repeatMode).toBeUndefined();
    });

    it("adopts the repeat mode a previous build stored under the player's key", () => {
      localStorage.setItem("lyra-player", JSON.stringify({ volume: 1, repeatMode: "all" }));

      const store = hydratedStore();

      expect(store.repeatMode).toBe("all");
    });

    it("prefers its own stored repeat mode over the legacy one", () => {
      localStorage.setItem("lyra-player", JSON.stringify({ repeatMode: "all" }));
      localStorage.setItem("audiogram-queue-v1", JSON.stringify({ persistedSnapshot: null, repeatMode: "one" }));

      const store = hydratedStore();

      expect(store.repeatMode).toBe("one");
    });

    it("ignores a legacy value that is not a repeat mode", () => {
      localStorage.setItem("lyra-player", JSON.stringify({ repeatMode: "bogus" }));

      const store = hydratedStore();

      expect(store.repeatMode).toBe("off");
    });
  });

  describe("restorePersistedQueue edge cases", () => {
    it("should do nothing when snapshot is null", async () => {
      const store = useQueueStore();
      await store.restorePersistedQueue();
      expect(store.queue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
    });

    it("should clear queue when repository throws", async () => {
      vi.mocked(trackRepository.findByIds).mockRejectedValue(new Error("DB error"));

      const store = useQueueStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [{ id: "item-1", track: { kind: "library", trackId: "1" }, source: { type: "manual" }, addedAt: 100 }],
        originalQueueOrder: ["item-1"],
        currentIndex: 0,
        isShuffled: false,
      };

      await store.restorePersistedQueue();

      expect(store.queue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
    });

    it("should skip library tracks not found in database", async () => {
      vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([]));

      const store = useQueueStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [{ id: "item-1", track: { kind: "library", trackId: "nonexistent" }, source: { type: "manual" }, addedAt: 100 }],
        originalQueueOrder: ["item-1"],
        currentIndex: 0,
        isShuffled: false,
      };

      await store.restorePersistedQueue();

      expect(store.queue).toEqual([]);
      expect(store.currentIndex).toBe(-1);
    });

    it("should restore file-based ephemeral track from snapshot", async () => {
      const store = useQueueStore();

      store.persistedSnapshot = {
        version: 1,
        queue: [{
          id: "item-1",
          track: {
            kind: "ephemeral",
            id: "eph-1",
            title: "Local File",
            source: { type: "file" },
          },
          source: { type: "manual" },
          addedAt: 100,
        }],
        originalQueueOrder: ["item-1"],
        currentIndex: 0,
        isShuffled: false,
      };

      await store.restorePersistedQueue();

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track.id).toBe("eph-1");
    });
  });

  describe("restorePersistedQueue proxy URL migration", () => {
    // Port and token change every launch — restore must re-point any stored
    // proxy URL at the live server base.
    const LIVE_BASE = "http://127.0.0.1:4321/livetoken";

    beforeEach(() => {
      setMediaServerBaseForTests(LIVE_BASE);
    });

    function snapshotWithEphemeral(track: Record<string, unknown>, cover?: string | null) {
      return {
        version: 1 as const,
        queue: [{
          id: "item-1" as any,
          track: {
            kind: "ephemeral",
            id: "eph-1",
            title: "T",
            source: { type: "url", url: "https://example.com/a.mp3" },
            ...track,
          } as any,
          source: { type: "manual" as const },
          addedAt: 100,
          cover,
        }],
        originalQueueOrder: ["item-1" as any],
        currentIndex: 0,
        isShuffled: false,
      };
    }

    it("rewrites previous-session server URLs with a stale port and token", async () => {
      const store = useQueueStore();
      store.persistedSnapshot = snapshotWithEphemeral({
        source: { type: "url", url: "http://127.0.0.1:60123/staletoken/yt/dQw4w9WgXcQ" },
      });

      await store.restorePersistedQueue();

      expect((store.queue[0].track as any).source.url).toBe(`${LIVE_BASE}/yt/dQw4w9WgXcQ`);
    });

    it("rewrites proxied cover fields and leaves foreign URLs untouched", async () => {
      const store = useQueueStore();
      store.persistedSnapshot = snapshotWithEphemeral(
        {
          source: { type: "url", url: "https://radio.example/stream.m3u8" },
          cover: "http://127.0.0.1:60123/staletoken/nd/cover/al-1?size=300",
        },
        "http://127.0.0.1:60123/staletoken/nd/cover/al-2",
      );

      await store.restorePersistedQueue();

      const restored = store.queue[0];
      expect((restored.track as any).source.url).toBe("https://radio.example/stream.m3u8");
      expect((restored.track as any).cover).toBe(`${LIVE_BASE}/nd/cover/al-1?size=300`);
      expect(restored.cover).toBe(`${LIVE_BASE}/nd/cover/al-2`);
    });

    it("rewrites item covers of library tracks too", async () => {
      vi.mocked(trackRepository.findByIds).mockResolvedValue(ok([createTrackEntity("1")]));
      const store = useQueueStore();
      store.persistedSnapshot = {
        version: 1,
        queue: [{
          id: "item-1" as any,
          track: { kind: "library", trackId: "1" as any },
          source: { type: "manual" as const },
          addedAt: 100,
          cover: "http://127.0.0.1:60123/staletoken/nd/cover/al-9",
        }],
        originalQueueOrder: ["item-1" as any],
        currentIndex: 0,
        isShuffled: false,
      };

      await store.restorePersistedQueue();

      expect(store.queue[0].cover).toBe(`${LIVE_BASE}/nd/cover/al-9`);
    });
  });

  describe("syncTrackMetadata with ephemeral track", () => {
    it("should be a no-op for ephemeral tracks", () => {
      const store = useQueueStore();
      const track = { kind: "ephemeral", id: "eph-1", title: "Eph", source: { type: "url", url: "https://example.com/a.mp3" } } as any;
      seedQueueItems(store, [
        { id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() },
      ]);

      store.syncTrackMetadata({ ...track, title: "Updated" });

      expect(store.queue[0].track.title).toBe("Eph");
    });
  });

  describe("clear edge cases", () => {
    it("should call player stop and clearCurrentTrack", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      store.clear();

      expect(stopSpy).toHaveBeenCalled();
      expect(clearCurrentTrackSpy).toHaveBeenCalled();
      expect(store.currentIndex).toBe(-1);
      expect(store.isShuffled).toBe(false);
    });
  });

  describe("setQueue edge cases", () => {
    it("should clamp out-of-bounds startIndex", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      const tracks = [createTrack("1")];
      await store.setQueue(tracks, -5);

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(tracks[0]);

      await store.setQueue(tracks, 100);

      expect(store.currentIndex).toBe(0);
    });

    it("should fall back to clear when all tracks fail to play", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("fail"));
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      await store.setQueue([createTrack("1")], 0);

      expect(store.currentIndex).toBe(-1);
      expect(stopSpy).toHaveBeenCalled();
      expect(clearCurrentTrackSpy).toHaveBeenCalled();
    });
  });

  describe("previous edge cases", () => {
    it("should go to last track when currentIndex is -1 and repeat-all", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, -1);
      playerStore.currentTime = 1;
      store.repeatMode = "all";

      await store.previous();

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });
  });

  describe("next with failing tracks", () => {
    it("should skip failing track and try next", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack")
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(2);
      expect(playerStore.playPlayerTrack).toHaveBeenCalledTimes(2);
      expect(playerStore.playPlayerTrack).toHaveBeenNthCalledWith(1, createTrack("2"));
      expect(playerStore.playPlayerTrack).toHaveBeenNthCalledWith(2, createTrack("3"));
    });

    it("should stop when all remaining tracks fail", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("fail"));
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);
      store.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(-1);
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe("removeFromQueue with failing play", () => {
    it("should not throw when play fails for removed current", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("fail"));

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ]);
      seedCurrentIndex(store, 0);

      expect(() => store.removeFromQueue("item-1" as any)).not.toThrow();
    });
  });

  describe("jumpTo edge cases", () => {
    it("should do nothing for out-of-bounds index", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      seedQueueItems(store, [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
      ]);

      await store.jumpTo(-1);
      expect(playSpy).not.toHaveBeenCalled();

      await store.jumpTo(5);
      expect(playSpy).not.toHaveBeenCalled();
    });
  });
});
