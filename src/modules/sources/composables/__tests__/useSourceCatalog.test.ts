import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { okAsync } from "neverthrow";

const configState = vi.hoisted(() => ({ current: {} as object | null }));
const providerMock = vi.hoisted(() => ({
  listArtists: vi.fn(),
  listAlbums: vi.fn(),
  getPlaylistPage: vi.fn(),
  get isAvailable() {
    return configState.current !== null;
  },
}));

// Swappable so a test can stand in a provider that implements less of the
// contract than the default one does.
const registry = vi.hoisted(() => ({ provider: null as unknown }));

// Mocking the registry module also covers the "@/modules/sources" barrel the
// query options import from — both resolve to the same module id.
vi.mock("../../registry", () => ({ sources: { get: () => registry.provider } }));

import { useSourceAlbumsInfinite, useSourceArtists, useSourcePlaylistPages, useSourceSearchPages } from "../useSourceCatalog";
import { queryKeys } from "@/queries/query-keys";
import type { PlaylistId } from "@/types/ids";

let lastQueryClient!: QueryClient;

function mountComposable<T>(setup: () => T): T {
  let result!: T;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  lastQueryClient = queryClient;
  mount(defineComponent({
    setup() {
      result = setup();
      return () => h("div");
    },
  }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return result;
}

async function flush() {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
}

describe("useSourceCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configState.current = {};
    registry.provider = providerMock;
  });

  it("sits on skipToken while the source is unavailable", async () => {
    configState.current = null;

    const query = mountComposable(() => useSourceArtists("nd"));
    await flush();

    expect(query.data.value).toBeUndefined();
    expect(providerMock.listArtists).not.toHaveBeenCalled();
  });

  it("fetches artists when the source is configured", async () => {
    providerMock.listArtists.mockReturnValue(okAsync([{ id: "nd:ar1", name: "Artist" }]));

    const query = mountComposable(() => useSourceArtists("nd"));
    await flush();

    expect(query.data.value).toEqual([{ id: "nd:ar1", name: "Artist" }]);
  });

  it("pages the infinite album feed until a short page ends it", async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => ({ id: `nd:al${index}`, title: `A${index}` }));
    providerMock.listAlbums.mockReturnValueOnce(okAsync(fullPage));

    const query = mountComposable(() => useSourceAlbumsInfinite("nd", "alpha"));
    await flush();

    expect(providerMock.listAlbums).toHaveBeenCalledWith({ offset: 0, limit: 100, sort: "alpha" });
    expect(query.hasNextPage.value).toBe(true);

    providerMock.listAlbums.mockReturnValueOnce(okAsync([{ id: "nd:al-last", title: "Last" }]));
    await query.fetchNextPage();
    await flush();

    expect(providerMock.listAlbums).toHaveBeenLastCalledWith({ offset: 100, limit: 100, sort: "alpha" });
    expect(query.hasNextPage.value).toBe(false);
    expect(query.data.value?.pages.flat()).toHaveLength(101);
  });

  // The point of the paged path: the first page renders without waiting for
  // continuations, and the metadata rides along with it.
  it("walks playlist pages by cursor, metadata on the first only", async () => {
    providerMock.getPlaylistPage.mockReturnValueOnce(okAsync({
      playlist: { id: "yt:PL1", name: "Mix", trackCount: 200, coverRef: undefined },
      page: { items: [{ id: "yt:v1" }], cursor: "CURSOR_A" },
    }));

    const query = mountComposable(() => useSourcePlaylistPages("yt", "yt:PL1" as PlaylistId));
    await flush();

    expect(providerMock.getPlaylistPage).toHaveBeenCalledWith("yt:PL1", null);
    expect(query.data.value?.pages[0]?.playlist?.name).toBe("Mix");
    expect(query.hasNextPage.value).toBe(true);

    providerMock.getPlaylistPage.mockReturnValueOnce(okAsync({
      playlist: null,
      page: { items: [{ id: "yt:v2" }], cursor: null },
    }));
    await query.fetchNextPage();
    await flush();

    expect(providerMock.getPlaylistPage).toHaveBeenLastCalledWith("yt:PL1", "CURSOR_A");
    expect(query.hasNextPage.value).toBe(false);
    expect(query.data.value?.pages.flatMap(page => page.page.items)).toHaveLength(2);
  });

  // A source without the method opts out; the caller can hold this
  // composable unconditionally and let the kind decide which path runs.
  it("sits on skipToken for a source that does not page its playlists", async () => {
    registry.provider = { ...providerMock, isAvailable: true, getPlaylistPage: undefined };

    const query = mountComposable(() => useSourcePlaylistPages("nd", "nd:pl1" as PlaylistId));
    await flush();

    expect(query.data.value).toBeUndefined();
    expect(providerMock.getPlaylistPage).not.toHaveBeenCalled();
  });

  // The app-wide default is "always" (Dexie must read offline); a remote
  // feed still has to wait for the network, or it fails instantly offline.
  it("keeps the infinite remote feeds waiting for the network", async () => {
    providerMock.listAlbums.mockReturnValue(okAsync([]));
    providerMock.getPlaylistPage.mockReturnValue(okAsync({ playlist: null, page: { items: [], cursor: null } }));
    registry.provider = {
      ...providerMock,
      searchPage: vi.fn(() => okAsync({ items: [], cursor: null })),
    };

    mountComposable(() => {
      useSourceAlbumsInfinite("nd", "alpha");
      useSourcePlaylistPages("yt", "yt:PL1" as PlaylistId);
      useSourceSearchPages("yt", "q", "all");
    });
    await flush();

    const modeOf = (queryKey: readonly unknown[]) =>
      lastQueryClient.getQueryCache().find({ queryKey })?.options.networkMode;

    expect(modeOf(queryKeys.source.albumsInf("nd", "alpha"))).toBe("online");
    expect(modeOf(queryKeys.source.playlistPages("yt", "yt:PL1" as PlaylistId))).toBe("online");
    expect(modeOf(queryKeys.source.searchPages("yt", "all", "q"))).toBe("online");
  });
});
