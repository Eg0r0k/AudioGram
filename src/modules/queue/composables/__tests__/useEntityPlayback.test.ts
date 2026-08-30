import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { Track } from "@/modules/player/types";
import type { QueueSource } from "@/modules/queue/types";

const queue = vi.hoisted(() => ({
  setQueue: vi.fn(),
  addMultipleToQueue: vi.fn(),
}));
const player = vi.hoisted(() => ({
  currentTrack: null as { id: string } | null,
  togglePlay: vi.fn(),
}));
const shuffle = vi.hoisted(() => vi.fn());

vi.mock("@/modules/queue/store/queue.store", () => ({ useQueueStore: () => queue }));
vi.mock("@/modules/player/store/player.store", () => ({ usePlayerStore: () => player }));
vi.mock("@/modules/queue/composables/useQueueShuffle", () => ({ useQueueShuffle: () => shuffle }));

import { useEntityPlayback } from "../useEntityPlayback";

const track = (id: string) => ({ id, title: id } as Track);

const ALBUM: QueueSource = { type: "album", albumId: "nd:al1" as never };

/** What the page renders: the first Dexie page of a longer album. */
const LOADED = [track("t1"), track("t2")];
/** What the album actually holds. */
const WHOLE = [track("t1"), track("t2"), track("t3"), track("t4")];

describe("useEntityPlayback", () => {
  beforeEach(() => {
    queue.setQueue.mockClear();
    queue.addMultipleToQueue.mockClear();
    shuffle.mockClear();
    player.currentTrack = null;
  });

  const playback = (isComplete: boolean, tracks = LOADED) => useEntityPlayback({
    tracks: ref(tracks),
    source: ref(ALBUM),
    isComplete: ref(isComplete),
    loadAll: async () => WHOLE,
  });

  // The regression this composable exists to prevent: a remote-branded id
  // whose page still pages out of Dexie must not queue only what is loaded.
  it("queues the full list when the rendered one is only a page of it", async () => {
    await playback(false).playAll();

    expect(queue.setQueue).toHaveBeenCalledWith(WHOLE, 0, ALBUM);
  });

  it("queues what is on screen when that is already the whole entity", async () => {
    await playback(true).playAll();

    expect(queue.setQueue).toHaveBeenCalledWith(LOADED, 0, ALBUM);
  });

  it("maps a row's index onto its position in the full list", async () => {
    await playback(false).playTrack(1);

    expect(queue.setQueue).toHaveBeenCalledWith(WHOLE, 1, ALBUM);
  });

  // A complete list is the one on screen, so the index is used as given —
  // an id lookup would pick the first of a repeated track.
  it("uses the row index directly on a complete list", async () => {
    const repeated = [track("t1"), track("t1")];
    await playback(true, repeated).playTrack(1);

    expect(queue.setQueue).toHaveBeenCalledWith(repeated, 1, ALBUM);
  });

  it("toggles playback instead of requeueing the track already playing", async () => {
    player.currentTrack = { id: "t2" };
    await playback(false).playTrack(1);

    expect(player.togglePlay).toHaveBeenCalled();
    expect(queue.setQueue).not.toHaveBeenCalled();
  });

  it("hands shuffle the full list too", async () => {
    await playback(false).shuffle();

    expect(shuffle).toHaveBeenCalledWith(ALBUM, expect.any(Function));
    expect(await shuffle.mock.calls[0][1]()).toEqual(WHOLE);
  });

  it("does nothing without a queue source to record", async () => {
    const { playAll } = useEntityPlayback({
      tracks: ref(LOADED),
      source: ref(null),
      isComplete: ref(true),
      loadAll: async () => WHOLE,
    });
    await playAll();

    expect(queue.setQueue).not.toHaveBeenCalled();
  });

  it("adds only the rendered rows to the queue", () => {
    playback(false).addToQueue();

    expect(queue.addMultipleToQueue).toHaveBeenCalledWith(LOADED);
  });
});
