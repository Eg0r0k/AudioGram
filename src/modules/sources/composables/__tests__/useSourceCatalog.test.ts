import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { okAsync } from "neverthrow";

const configState = vi.hoisted(() => ({ current: {} as object | null }));
const providerMock = vi.hoisted(() => ({
  listArtists: vi.fn(),
  listAlbums: vi.fn(),
  get isAvailable() {
    return configState.current !== null;
  },
}));

// Mocking the registry module also covers the "@/modules/sources" barrel the
// query options import from — both resolve to the same module id.
vi.mock("../../registry", () => ({ sources: { get: () => providerMock } }));

import { useSourceAlbumsInfinite, useSourceArtists } from "../useSourceCatalog";

function mountComposable<T>(setup: () => T): T {
  let result!: T;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
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
});
