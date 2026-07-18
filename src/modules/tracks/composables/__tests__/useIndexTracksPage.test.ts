import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const PAGE_SIZE = 50;
const LIBRARY_TOTAL = 500; // 10 pages
const REAL_TOTAL_DURATION = 9999;

// Pages no longer carry a library-wide duration; it lives in a separate aggregate
// query. getTracksPaginated returns real rows so the flattened list length (what
// VirtualScrollable uses as itemCount) can be asserted.
vi.mock("@/queries/track.queries", () => ({
  getTracksPaginated: vi.fn(async (offset: number) => ({
    tracks: Array.from(
      { length: Math.min(PAGE_SIZE, LIBRARY_TOTAL - offset) },
      (_, i) => ({ id: `track-${offset + i}` }),
    ),
    nextOffset: offset + PAGE_SIZE < LIBRARY_TOTAL ? offset + PAGE_SIZE : null,
    total: LIBRARY_TOTAL,
  })),
  trackQueries: {
    indexTotalDuration: (search = "") => ({
      queryKey: ["tracks", "index", "totalDuration", search],
      queryFn: async () => REAL_TOTAL_DURATION,
    }),
  },
}));

import { useIndexTracksPage } from "../useIndexTracksPage";

function mountComposable() {
  let api!: ReturnType<typeof useIndexTracksPage>;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useIndexTracksPage(ref(null), ref(""));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api, wrapper };
}

describe("useIndexTracksPage", () => {
  it("sources totalDuration from the aggregate query, not the infinite pages", async () => {
    const { api, wrapper } = mountComposable();
    await flushPromises();

    const pages = api.data.value?.pages ?? [];
    expect(pages[0]).not.toHaveProperty("totalDuration");
    expect(api.totalDuration.value).toBe(REAL_TOTAL_DURATION);

    wrapper.unmount();
  });

  it("keeps every page so a 500-track library scrolls to the last row (no maxPages cap)", async () => {
    const { api, wrapper } = mountComposable();
    await flushPromises();

    // Exhaust the infinite query the way the virtualizer's loadMore would.
    let guard = 0;
    while (api.hasNextPage.value && guard < 50) {
      await api.fetchNextPage();
      await flushPromises();
      guard++;
    }

    // maxPages would cap the flattened array (VirtualScrollable's itemCount) at
    // 200, freezing the container height; without it the whole library loads.
    expect(api.tracks.value.length).toBe(LIBRARY_TOTAL);
    expect(api.hasNextPage.value).toBe(false);

    wrapper.unmount();
  });
});
