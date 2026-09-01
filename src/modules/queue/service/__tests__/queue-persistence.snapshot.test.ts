import { describe, expect, it, vi } from "vitest";
import type { QueueItemId, TrackId } from "@/types/ids";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import type { QueueItem } from "../../types";

vi.mock("@/db/repositories", () => ({ playlistRepository: {}, trackRepository: {} }));
vi.mock("@/modules/player/utils/trackEntity", () => ({ mapTrackEntityToPlayerTrack: (e: unknown) => e }));
vi.mock("@/lib/stream-url", () => ({ migrateProxyUrl: (url: string) => url }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

import { buildPersistedQueueSnapshot } from "../queue-persistence";

const track = (id: string): Track => ({
  kind: "library",
  id: id as TrackId,
  title: id,
  artist: "A",
  artistIds: [],
  albumId: "al" as Track["albumId"],
  albumName: "Al",
  storagePath: `${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 1,
  isLiked: false,
});

const item = (id: string): QueueItem => ({
  id: id as QueueItemId,
  track: track(id),
  source: { type: "manual" },
  addedAt: 0,
});

describe("buildPersistedQueueSnapshot", () => {
  it("reuses the serialized form of an unchanged item across snapshots", () => {
    const items = [item("a"), item("b")];

    const first = buildPersistedQueueSnapshot({ queue: items, items, currentItemId: null, isShuffled: false });
    const second = buildPersistedQueueSnapshot({ queue: items, items, currentItemId: "b" as QueueItemId, isShuffled: false });

    expect(second?.currentIndex).toBe(1);
    expect(second?.queue[0]).toBe(first?.queue[0]);
    expect(second?.queue[1]).toBe(first?.queue[1]);
  });

  it("serializes a replaced item afresh", () => {
    const items = [item("a")];
    const first = buildPersistedQueueSnapshot({ queue: items, items, currentItemId: null, isShuffled: false });

    const edited = [{ ...items[0], cover: "cover.jpg" }];
    const second = buildPersistedQueueSnapshot({ queue: edited, items: edited, currentItemId: null, isShuffled: false });

    expect(second?.queue[0]).not.toBe(first?.queue[0]);
    expect(second?.queue[0]?.cover).toBe("cover.jpg");
  });
});
