import { createPinia, setActivePinia } from "pinia";
import { errAsync, okAsync } from "neverthrow";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YtPlayable } from "../../types";

const engineMock = vi.hoisted(() => ({ importFromPaths: vi.fn() }));
const providerMock = vi.hoisted(() => ({ download: vi.fn(), cancelDownload: vi.fn() }));
const playlistQueriesMock = vi.hoisted(() => ({
  createPlaylistAndSync: vi.fn(),
  addTracksToPlaylistAndSync: vi.fn(),
}));
const invalidateLibraryDataMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("vue-sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/services/importer.service", () => ({ musicLibraryEngine: engineMock }));
vi.mock("@/modules/youtube/provider", () => ({ youtubeProvider: providerMock }));
vi.mock("@/modules/youtube/lib/cache", () => ({ cleanupCacheFile: vi.fn(async () => {}) }));
vi.mock("@/queries/playlist.queries", () => playlistQueriesMock);
vi.mock("@/queries/library.queries", () => ({ invalidateLibraryData: invalidateLibraryDataMock }));

function playable(id: string): YtPlayable {
  return { id, title: `Track ${id}`, meta: { title: `Track ${id}` } } as unknown as YtPlayable;
}

async function freshComposable() {
  vi.resetModules();
  const { useYtBatchImport } = await import("../useYtBatchImport");
  return useYtBatchImport();
}

describe("useYtBatchImport", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    providerMock.download.mockImplementation((videoId: string) =>
      okAsync({ path: `C:/cache/${videoId}.m4a` }));
    engineMock.importFromPaths.mockImplementation(async (paths: string[]) => ({
      successful: [{ trackId: `local-${paths[0]}`, fileName: paths[0], title: "T", artist: "A", album: "" }],
      failed: [],
      skipped: 0,
      total: 1,
    }));
  });

  it("imports every track without creating a playlist", async () => {
    const batch = await freshComposable();

    await batch.start([playable("v1"), playable("v2")]);

    expect(providerMock.download).toHaveBeenCalledTimes(2);
    expect(engineMock.importFromPaths).toHaveBeenCalledTimes(2);
    expect(playlistQueriesMock.createPlaylistAndSync).not.toHaveBeenCalled();
    expect(playlistQueriesMock.addTracksToPlaylistAndSync).not.toHaveBeenCalled();
    expect(batch.state.value.status).toBe("done");
    expect(batch.state.value.items.map(i => i.status)).toEqual(["done", "done"]);
  });

  it("refreshes the library after successful imports", async () => {
    const batch = await freshComposable();

    await batch.start([playable("v1")]);

    expect(invalidateLibraryDataMock).toHaveBeenCalledTimes(1);
  });

  it("marks a failed download as an error and keeps going", async () => {
    providerMock.download
      .mockImplementationOnce(() => okAsync({ path: "C:/cache/v1.m4a" }))
      .mockImplementationOnce(() => errAsync({ kind: "NETWORK", message: "boom" }));
    const batch = await freshComposable();

    await batch.start([playable("v1"), playable("v2")]);

    expect(batch.state.value.items.map(i => i.status)).toEqual(["done", "error"]);
    expect(batch.state.value.status).toBe("done");
  });
});
