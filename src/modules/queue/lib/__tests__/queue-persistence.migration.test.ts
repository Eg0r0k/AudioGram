import { beforeEach, describe, expect, it, vi } from "vitest";
import { okAsync } from "neverthrow";
import { ndTrackId } from "@/types/track-ref";
import type { QueueItemId, TrackId } from "@/types/ids";

const repoMock = vi.hoisted(() => ({
  localPlaylistIds: new Set<string>(),
  tracks: [] as { id: string }[],
}));

vi.mock("@/db/repositories", () => ({
  playlistRepository: {
    findById: (id: string) => okAsync(repoMock.localPlaylistIds.has(id) ? { id, name: "Local" } : undefined),
  },
  trackRepository: {
    findByIds: (ids: string[]) => okAsync(ids.map(id => ({ id }))),
  },
}));
vi.mock("@/modules/player/utils/trackEntity", () => ({
  mapTrackEntityToPlayerTrack: (entity: { id: string }) => ({ kind: "library", ...entity }),
}));
vi.mock("@/lib/stream-url", () => ({ migrateProxyUrl: (url: string) => url }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

import { rehydratePersistedQueue } from "../queue-persistence";

const snapshot = (playlistId: string, trackId: string) => ({
  version: 1 as const,
  queue: [{
    id: "qi1" as QueueItemId,
    track: { kind: "library" as const, trackId: trackId as TrackId },
    source: { type: "playlist" as const, playlistId: playlistId as never },
    addedAt: 0,
  }],
  originalQueueOrder: ["qi1" as QueueItemId],
  currentIndex: 0,
  isShuffled: false,
});

const restoredSource = async (playlistId: string, trackId: string) => {
  const state = await rehydratePersistedQueue(snapshot(playlistId, trackId));
  return state?.items[0].source;
};

describe("queue snapshot playlist source migration", () => {
  beforeEach(() => {
    repoMock.localPlaylistIds = new Set();
  });

  it("brands a raw ND playlist id written before playlist ids were branded", async () => {
    expect(await restoredSource("pl1", ndTrackId("s1"))).toEqual({ type: "playlist", playlistId: "nd:pl1" });
  });

  // A local playlist may hold nothing but ND tracks, so the track kinds alone
  // are not proof — an existing local row settles it.
  it("leaves the id alone when a local playlist owns it", async () => {
    repoMock.localPlaylistIds = new Set(["pl1"]);

    expect(await restoredSource("pl1", ndTrackId("s1"))).toEqual({ type: "playlist", playlistId: "pl1" });
  });

  it("leaves the id alone when the queued track is local", async () => {
    expect(await restoredSource("pl1", "local-track")).toEqual({ type: "playlist", playlistId: "pl1" });
  });

  it("passes an already branded id through untouched", async () => {
    expect(await restoredSource("nd:pl1", ndTrackId("s1"))).toEqual({ type: "playlist", playlistId: "nd:pl1" });
  });
});
