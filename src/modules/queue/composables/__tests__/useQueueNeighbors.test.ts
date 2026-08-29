import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { TrackSource, TrackState } from "@/db/entities";
import type { QueueItem } from "../../types";
import type { Track } from "@/modules/player/types";

vi.mock("@/db/repositories", () => ({
  trackRepository: { findByIds: vi.fn() },
  coverRepository: { findByOwner: vi.fn(async () => ({ isOk: () => true, isErr: () => false, value: undefined })) },
}));
vi.mock("@/modules/covers/composables/useTrackCover", () => ({
  useTrackCover: () => ({ url: { value: undefined }, isLoading: { value: false } }),
}));

import { useQueueStore } from "../../store/queue.store";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueNeighbors } from "../useQueueNeighbors";

const track = (id: string): Track => ({
  kind: "library",
  id: id as Track["id"],
  title: `Track ${id}`,
  artist: "Artist",
  artistIds: [],
  albumId: "album" as Track["albumId"],
  albumName: "Album",
  storagePath: `tracks/${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 100,
  isLiked: false,
});

const item = (id: string): QueueItem => ({
  id: `item-${id}` as QueueItem["id"],
  track: track(id),
  source: { type: "manual" },
  addedAt: 1,
});

const seed = (ids: string[], current: number, repeatMode: "off" | "all" | "one" = "off") => {
  const queue = useQueueStore();
  const items = ids.map(item);
  queue.hydrate({ items, playbackOrder: null, currentItemId: items[current]?.id ?? null });
  queue.repeatMode = repeatMode;
  usePlayerStore().currentTrack = items[current]?.track ?? null;
};

describe("useQueueNeighbors", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("has no previous on the first entry and no next on the last without repeat", () => {
    seed(["1", "2", "3"], 0);
    const first = useQueueNeighbors();
    expect(first.previousItem.value).toBeNull();
    expect(first.nextItem.value?.track.id).toBe("2");

    seed(["1", "2", "3"], 2);
    const last = useQueueNeighbors();
    expect(last.previousItem.value?.track.id).toBe("2");
    expect(last.nextItem.value).toBeNull();
  });

  it("wraps under repeat-all", () => {
    seed(["1", "2", "3"], 2, "all");
    const { previousItem, nextItem } = useQueueNeighbors();
    expect(previousItem.value?.track.id).toBe("2");
    expect(nextItem.value?.track.id).toBe("1");
  });

  it("shows no neighbours at all for a single-entry queue, whatever the repeat mode", () => {
    for (const mode of ["off", "all", "one"] as const) {
      seed(["1"], 0, mode);
      const { previousItem, nextItem } = useQueueNeighbors();
      expect(previousItem.value, mode).toBeNull();
      expect(nextItem.value, mode).toBeNull();
    }
  });

  it("shows the other entry on both sides of a two-entry queue under repeat-all", () => {
    seed(["1", "2"], 0, "all");
    const { previousItem, nextItem } = useQueueNeighbors();
    expect(previousItem.value?.track.id).toBe("2");
    expect(nextItem.value?.track.id).toBe("2");
  });

  it("previews the following entry under repeat-one, as a user next() would play it", () => {
    seed(["1", "2", "3"], 0, "one");
    const { nextItem } = useQueueNeighbors();
    expect(nextItem.value?.track.id).toBe("2");
  });

  it("anchors on the displayed track while the player has not caught up with the queue cursor", () => {
    seed(["1", "2", "3"], 0);
    const queue = useQueueStore();
    const player = usePlayerStore();
    queue.hydrate({ items: queue.originalQueue, playbackOrder: null, currentItemId: "item-3" as QueueItem["id"] });
    player.currentTrack = track("1");

    const { previousItem, nextItem } = useQueueNeighbors();
    expect(previousItem.value).toBeNull();
    expect(nextItem.value?.track.id).toBe("2");
  });
});
