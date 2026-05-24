/* eslint-disable @typescript-eslint/no-explicit-any */
import { createPinia, setActivePinia } from "pinia";
import { ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackRepository } from "@/db/repositories";
import { TrackSource, TrackState, type TrackEntity } from "@/db/entities";
import { getRecommendations } from "@/modules/recommendations/service/recommender.service";
import { usePlayerStore } from "@/modules/player/store/player.store";
import type { Track } from "@/modules/player/types";
import { useQueueStore } from "../store/queue.store";

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

      store.queue = [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }];
      expect(store.isEmpty).toBe(false);
    });

    it("should compute size correctly", () => {
      const store = useQueueStore();

      expect(store.size).toBe(0);

      store.queue = [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      expect(store.size).toBe(2);
    });
  });

  describe("computed properties", () => {
    it("should compute currentItem correctly", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      store.queue = [
        { id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      expect(store.currentItem?.track).toStrictEqual(track);
    });

    it("should return null for currentItem when index is -1", () => {
      const store = useQueueStore();
      store.queue = [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }];
      store.currentIndex = -1;

      expect(store.currentItem).toBe(null);
    });

    it("should compute currentTrack correctly", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      store.queue = [{ id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() }];
      store.currentIndex = 0;

      expect(store.currentTrack).toStrictEqual(track);
    });

    it("should compute hasNext correctly", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

      expect(store.hasNext).toBe(true);

      store.currentIndex = 1;
      expect(store.hasNext).toBe(false);

      playerStore.repeatMode = "all";
      expect(store.hasNext).toBe(true);
    });

    it("should compute hasPrevious correctly", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;
      playerStore.repeatMode = "off";

      expect(store.hasPrevious).toBe(true);

      store.currentIndex = 0;
      expect(store.hasPrevious).toBe(false);

      playerStore.repeatMode = "all";
      expect(store.hasPrevious).toBe(true);
    });

    it("should compute upcomingItems correctly", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      expect(store.upcomingItems).toHaveLength(2);
      expect(store.upcomingItems[0].track.id).toBe("2");
      expect(store.upcomingItems[1].track.id).toBe("3");
    });

    it("should compute previousItems correctly", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 2;

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
      store.queue = [{ id: "1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }];
      store.currentIndex = 0;

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

      store.isShuffled = true;

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

      store.queue = [
        { id: "item-1" as any, track: track1, source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: track2, source: { type: "manual" as const }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.insertNext(trackToInsert);

      expect(store.queue[1].track).toStrictEqual(trackToInsert);
    });

    it("should insert at beginning when no current track", () => {
      const store = useQueueStore();
      const track = createTrack("1");
      const trackToInsert = createTrack("insert");

      store.queue = [{ id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() }];
      store.currentIndex = -1;

      store.insertNext(trackToInsert);

      expect(store.queue[0].track).toStrictEqual(trackToInsert);
    });
  });

  describe("removeFromQueue", () => {
    it("should remove track by id", () => {
      const store = useQueueStore();
      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeFromQueue("item-2" as any);

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track.id).toBe("1");
    });

    it("should update currentIndex when removing item before current", () => {
      const store = useQueueStore();
      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 2;

      store.removeFromQueue("item-1" as any);

      expect(store.currentIndex).toBe(1);
    });
  });

  describe("removeMultiple", () => {
    it("should remove multiple tracks by ids", () => {
      const store = useQueueStore();
      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeMultiple(["item-1" as any, "item-3" as any]);

      expect(store.queue).toHaveLength(1);
      expect(store.queue[0].track.id).toBe("2");
    });
  });

  describe("moveTrack", () => {
    it("should move track from one position to another", () => {
      const store = useQueueStore();
      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];

      store.moveTrack(0, 2);

      expect(store.queue[0].track.id).toBe("2");
      expect(store.queue[2].track.id).toBe("1");
    });

    it("should update currentIndex when moving current track", () => {
      const store = useQueueStore();
      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.moveTrack(0, 1);

      expect(store.currentIndex).toBe(1);
    });
  });

  describe("shuffle", () => {
    it("should shuffle queue but keep current track first", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.shuffle();

      expect(store.isShuffled).toBe(true);
      expect(store.queue[0].track.id).toBe("1");
      expect(store.queue).toHaveLength(3);
    });

    it("should not shuffle if queue has 1 or fewer items", () => {
      const store = useQueueStore();
      store.queue = [{ id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() }];

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

      await store.restorePersistedQueue();

      expect(trackRepository.findByIds).toHaveBeenCalledWith(["1", "2"]);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "2"]);
      expect(store.currentIndex).toBe(1);
      expect(playerStore.currentTrack?.id).toBe("2");
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
  });

  describe("jumpTo", () => {
    it("should jump to specific index and play", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" as const }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      await store.jumpToId("item-2" as any);

      expect(store.currentIndex).toBe(1);
    });

    it("should do nothing when id not found", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

      await store.next();

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should restart current track in repeat-one mode", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "one";

      await store.next();

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should loop to start in repeat-all mode", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;
      playerStore.repeatMode = "all";

      await store.next();

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should stop when at end with repeat off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;
      playerStore.repeatMode = "off";

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

      await store.next();

      expect(getRecommendations).toHaveBeenCalledWith(createTrack("1").id, 5, [createTrack("1").id]);
      expect(store.queue.map(item => item.track.id)).toEqual(["1", "rec-1", "rec-2", "rec-3", "rec-4", "rec-5"]);
      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ id: "rec-1", kind: "library" }));
    });

    it("should do nothing when queue is empty", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [];
      store.currentIndex = -1;

      await store.next();

      expect(playSpy).not.toHaveBeenCalled();
    });

    it("should clear current selection when last track cannot play", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "playPlayerTrack").mockRejectedValue(new Error("missing file"));
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);
      const clearCurrentTrackSpy = vi.spyOn(playerStore, "clearCurrentTrack").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;
      playerStore.currentTime = 1;

      await store.previous();

      expect(store.currentIndex).toBe(0);
      expect(playSpy).toHaveBeenCalledWith(createTrack("1"));
    });

    it("should restart current track when currentTime > RESTART_THRESHOLD", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const seekSpy = vi.spyOn(playerStore, "seekTo").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.currentTime = 5;

      await store.previous();

      expect(seekSpy).toHaveBeenCalledWith(0);
    });

    it("should loop to end in repeat-all mode", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.currentTime = 1;
      playerStore.repeatMode = "all";

      await store.previous();

      expect(store.currentIndex).toBe(1);
      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should seek to 0 when at start with repeat off", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const seekSpy = vi.spyOn(playerStore, "seekTo").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.currentTime = 1;
      playerStore.repeatMode = "off";

      await store.previous();

      expect(seekSpy).toHaveBeenCalledWith(0);
    });

    it("should do nothing when queue is empty", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [];

      await store.previous();

      expect(playSpy).not.toHaveBeenCalled();
    });
  });

  describe("toggleShuffle", () => {
    it("should shuffle when not shuffled", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      store.isShuffled = false;

      store.toggleShuffle();

      expect(store.isShuffled).toBe(true);
    });

    it("should unshuffle when already shuffled", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.isShuffled = true;

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeFromQueue("item-1" as any);

      expect(stopSpy).toHaveBeenCalled();
      expect(store.currentIndex).toBe(-1);
    });

    it("should update currentIndex when removing after current", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeFromQueue("item-2" as any);

      expect(store.currentIndex).toBe(0);
    });

    it("should play next when removing current", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeFromQueue("item-1" as any);

      expect(playSpy).toHaveBeenCalledWith(createTrack("2"));
    });

    it("should do nothing when id not found", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const stopSpy = vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.removeMultiple(["item-1" as any]);

      expect(stopSpy).toHaveBeenCalled();
      expect(store.currentIndex).toBe(-1);
    });

    it("should recalculate index after removal", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;

      store.removeMultiple(["item-1" as any]);

      expect(store.currentIndex).toBe(0);
    });
  });

  describe("moveTrack edge cases", () => {
    it("should do nothing when fromIndex equals toIndex", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.moveTrack(0, 0);

      expect(store.queue[0].track.id).toBe("1");
    });

    it("should decrement index when moving item before current", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 2;

      store.moveTrack(0, 2);

      expect(store.currentIndex).toBe(1);
    });

    it("should increment index when moving item after current", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.moveTrack(2, 0);

      expect(store.currentIndex).toBe(1);
    });

    it("should do nothing for invalid indices", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];

      store.moveTrack(-1, 0);
      expect(store.queue[0].track.id).toBe("1");

      store.moveTrack(0, 10);
      expect(store.queue[0].track.id).toBe("1");
    });
  });

  describe("shuffle edge cases", () => {
    it("should save original queue on first shuffle", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      store.shuffle();

      expect(store.originalQueue).toHaveLength(2);
    });
  });

  describe("unshuffle edge cases", () => {
    it("should do nothing when not shuffled", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.isShuffled = false;

      store.unshuffle();

      expect(store.queue[0].track.id).toBe("1");
    });

    it("should do nothing when original queue is empty", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.isShuffled = true;

      store.unshuffle();

      expect(store.isShuffled).toBe(false);
      expect(store.queue[0].track.id).toBe("1");
    });
  });

  describe("computed properties edge cases", () => {
    it("should return null when currentIndex out of bounds", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 5;

      expect(store.currentItem).toBe(null);
      expect(store.currentTrack).toBe(null);
    });

    it("should return all items when currentIndex is -1", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = -1;

      expect(store.upcomingItems).toHaveLength(2);
      expect(store.previousItems).toHaveLength(0);
    });

    it("should return empty array for previousItems when at start", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      expect(store.previousItems).toHaveLength(0);
      expect(store.upcomingItems).toHaveLength(1);
    });

    it("should return true for hasNext with repeat all even at end", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "all";

      expect(store.hasNext).toBe(true);
    });

    it("should return true for hasPrevious with repeat all even at start", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "all";

      expect(store.hasPrevious).toBe(true);
    });

    it("should return false for hasNext when queue is empty", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [];
      playerStore.repeatMode = "all";

      expect(store.hasNext).toBe(false);
    });

    it("should return false for hasPrevious when queue is empty", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();

      store.queue = [];
      playerStore.repeatMode = "all";

      expect(store.hasPrevious).toBe(false);
    });
  });

  describe("removeMultiple — current not removed", () => {
    it("should recalculate currentIndex when current item stays", () => {
      const store = useQueueStore();

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 1;

      store.removeMultiple(["item-3"] as any);

      expect(store.currentIndex).toBe(1);
      expect(store.queue.map(i => i.track.id)).toEqual(["1", "2"]);
    });

    it("should fall back to index 0 when current item not found after removal", () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      vi.spyOn(playerStore, "stop").mockReturnValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      store.queue = [];

      store.removeMultiple(["item-1"] as any);

      expect(store.currentIndex).toBe(-1);
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

  describe("syncTrackMetadata with ephemeral track", () => {
    it("should be a no-op for ephemeral tracks", () => {
      const store = useQueueStore();
      const track = { kind: "ephemeral", id: "eph-1", title: "Eph", source: { type: "url", url: "https://example.com/a.mp3" } } as any;
      store.queue = [
        { id: "item-1" as any, track, source: { type: "manual" as const }, addedAt: Date.now() },
      ];

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = -1;
      playerStore.currentTime = 1;
      playerStore.repeatMode = "all";

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-3" as any, track: createTrack("3"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;
      playerStore.repeatMode = "off";

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

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" }, addedAt: Date.now() },
        { id: "item-2" as any, track: createTrack("2"), source: { type: "manual" }, addedAt: Date.now() },
      ];
      store.currentIndex = 0;

      expect(() => store.removeFromQueue("item-1" as any)).not.toThrow();
    });
  });

  describe("jumpTo edge cases", () => {
    it("should do nothing for out-of-bounds index", async () => {
      const store = useQueueStore();
      const playerStore = usePlayerStore();
      const playSpy = vi.spyOn(playerStore, "playPlayerTrack").mockResolvedValue(undefined);

      store.queue = [
        { id: "item-1" as any, track: createTrack("1"), source: { type: "manual" as const }, addedAt: Date.now() },
      ];

      await store.jumpTo(-1);
      expect(playSpy).not.toHaveBeenCalled();

      await store.jumpTo(5);
      expect(playSpy).not.toHaveBeenCalled();
    });
  });
});
