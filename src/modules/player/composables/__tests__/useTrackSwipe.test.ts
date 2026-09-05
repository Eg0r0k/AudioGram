import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { TrackSource, TrackState } from "@/db/entities";
import type { QueueItem } from "@/modules/queue/types";
import type { Track } from "@/modules/player/types";

vi.mock("@/db/repositories", () => ({
  trackRepository: { findByIds: vi.fn() },
}));
vi.mock("@/modules/covers/composables/useTrackCover", () => ({
  useTrackCover: () => ({ url: { value: undefined }, isLoading: { value: false } }),
}));

const motion = vi.hoisted(() => {
  const animate = vi.fn();
  const jump = vi.fn();
  return { animate, jump };
});
vi.mock("motion-v", () => ({
  animate: motion.animate,
  useMotionValue: (initial: number) => ({ get: () => initial, jump: motion.jump, set: vi.fn() }),
  useDragControls: () => ({ start: vi.fn() }),
  useReducedMotion: () => ref(false),
}));

import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useTrackSwipe } from "../useTrackSwipe";

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

const seed = (ids: string[], current: number) => {
  const queue = useQueueStore();
  const items = ids.map(item);
  queue.hydrate({ items, playbackOrder: null, currentItemId: items[current]?.id ?? null });
  usePlayerStore().currentTrack = items[current]?.track ?? null;
};

// The player follows the queue cursor synchronously here; in the app it
// follows once the track has loaded, which the anchor logic already covers.
const advance = async () => {
  const queue = useQueueStore();
  queue.hydrate({ items: queue.queue, playbackOrder: null, currentItemId: queue.queue[queue.currentIndex + 1]!.id });
  usePlayerStore().currentTrack = queue.currentItem!.track;
  await nextTick();
};

const centerOf = (slots: { role: string; key: string }[]) => slots.find(slot => slot.role === "center")?.key;
const keysOf = (slots: { key: string }[]) => slots.map(slot => slot.key);

describe("useTrackSwipe", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    motion.animate.mockClear();
    motion.jump.mockClear();
  });

  it("slides to the neighbour when the queue moves on while visible", async () => {
    seed(["1", "2", "3"], 0);
    const swipe = useTrackSwipe({ width: () => 300 });
    expect(centerOf(swipe.slots.value)).toBe("item-1");

    await advance();

    expect(centerOf(swipe.slots.value)).toBe("item-2");
    expect(motion.jump).toHaveBeenCalledWith(300);
    expect(motion.animate).toHaveBeenCalledTimes(1);
  });

  it("keeps its picture while covered and re-anchors on fresh nodes, without a slide, when uncovered", async () => {
    seed(["1", "2", "3", "4"], 0);
    const live = ref(true);
    const swipe = useTrackSwipe({ width: () => 300, active: () => live.value });
    const before = swipe.slots.value;

    live.value = false;
    await nextTick();
    await advance();

    expect(swipe.slots.value).toBe(before);
    expect(motion.animate).not.toHaveBeenCalled();

    live.value = true;
    await nextTick();

    // The entry that was the next slot is now the centre: a new key, so the
    // node is not reused with a stale opacity.
    expect(centerOf(swipe.slots.value)).toBe("item-2~1");
    expect(keysOf(swipe.slots.value)).not.toContain("item-2");
    expect(motion.jump).toHaveBeenCalledWith(0);
    expect(motion.animate).not.toHaveBeenCalled();

    // Back to normal: the next move slides on the same nodes.
    await advance();
    expect(centerOf(swipe.slots.value)).toBe("item-3~1");
    expect(motion.animate).toHaveBeenCalledTimes(1);
  });

  it("does not re-key when uncovered without the queue having moved", async () => {
    seed(["1", "2", "3"], 0);
    const live = ref(true);
    const swipe = useTrackSwipe({ width: () => 300, active: () => live.value });
    const before = swipe.slots.value;

    live.value = false;
    await nextTick();
    live.value = true;
    await nextTick();

    expect(keysOf(swipe.slots.value)).toEqual(keysOf(before));
    expect(motion.animate).not.toHaveBeenCalled();
  });
});
