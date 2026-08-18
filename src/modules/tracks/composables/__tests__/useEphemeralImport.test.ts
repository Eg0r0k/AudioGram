import { createPinia, setActivePinia } from "pinia";
import { ok } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackSource, TrackState, type TrackEntity } from "@/db/entities";
import { trackRepository } from "@/db/repositories";
import type { EphemeralTrack } from "@/modules/player/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { ImportBatchResult } from "@/services/types";
import { useEphemeralImport } from "../useEphemeralImport";

const importFromPathsMock = vi.hoisted(() =>
  vi.fn<(paths: string[]) => Promise<ImportBatchResult | null>>());

vi.mock("@/modules/library/composables/useImport", async () => {
  const { ref } = await import("vue");
  return {
    useImport: () => ({ importFromPaths: importFromPathsMock, isRunning: ref(false) }),
  };
});
vi.mock("@/db/repositories", () => ({
  trackRepository: {
    findById: vi.fn(),
    findByIds: vi.fn(),
  },
}));
vi.mock("@/modules/recommendations/service/recommender.service", () => ({
  getRecommendations: vi.fn(),
}));

function ephemeral(path: string): EphemeralTrack {
  return {
    kind: "ephemeral",
    id: "eph-1",
    title: "Open-with file",
    source: { type: "path", path },
  };
}

function importedEntity(id: string): TrackEntity {
  return {
    id: id as TrackEntity["id"],
    title: "Imported",
    artistName: "Artist",
    albumTitle: "Album",
    artistIds: [],
    albumId: "album-1" as TrackEntity["albumId"],
    tagIds: [],
    source: TrackSource.LOCAL_INTERNAL,
    storagePath: `tracks/${id}.mp3`,
    state: TrackState.READY,
    duration: 120,
    format: {},
    playCount: 0,
    addedAt: 0,
  };
}

function batchResult(trackId: string): ImportBatchResult {
  return {
    successful: [{ trackId: trackId as never, fileName: "x.flac", title: "Imported", artist: "Artist", album: "Album" }],
    failed: [],
    skipped: 0,
    total: 1,
  };
}

describe("useEphemeralImport", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("gates the CTA on an open-with path", () => {
    const track = ephemeral("C:/Music/x.flac");
    const { importPath } = useEphemeralImport(() => track);
    expect(importPath.value).toBe("C:/Music/x.flac");

    const { importPath: noPath } = useEphemeralImport(() => null);
    expect(noPath.value).toBeNull();
  });

  it("imports the file and swaps the queue entry onto the library track", async () => {
    const track = ephemeral("C:/Music/x.flac");
    const queueStore = useQueueStore();
    const playerStore = usePlayerStore();
    queueStore.queue = [
      { id: "q1" as never, track, source: { type: "manual" }, addedAt: 1 },
    ];
    queueStore.currentIndex = 0;
    playerStore.currentTrack = track;

    importFromPathsMock.mockResolvedValue(batchResult("lib-1"));
    vi.mocked(trackRepository.findById).mockResolvedValue(ok(importedEntity("lib-1")));

    const { importCurrent } = useEphemeralImport(() => track);
    await importCurrent();

    expect(importFromPathsMock).toHaveBeenCalledWith(["C:/Music/x.flac"]);
    expect(queueStore.queue[0].track).toMatchObject({ kind: "library", id: "lib-1" });
    expect(playerStore.currentTrack).toMatchObject({ kind: "library", id: "lib-1" });
  });

  it("leaves the queue alone when the import reports no success", async () => {
    const track = ephemeral("C:/Music/x.flac");
    const queueStore = useQueueStore();
    queueStore.queue = [
      { id: "q1" as never, track, source: { type: "manual" }, addedAt: 1 },
    ];

    importFromPathsMock.mockResolvedValue({ successful: [], failed: [], skipped: 1, total: 1 });

    const { importCurrent } = useEphemeralImport(() => track);
    await importCurrent();

    expect(queueStore.queue[0].track).toStrictEqual(track);
    expect(trackRepository.findById).not.toHaveBeenCalled();
  });

  it("does nothing without an importable path", async () => {
    const { importCurrent } = useEphemeralImport(() => null);
    await importCurrent();

    expect(importFromPathsMock).not.toHaveBeenCalled();
  });
});
