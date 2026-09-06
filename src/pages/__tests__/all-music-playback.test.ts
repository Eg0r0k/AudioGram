import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref, toValue } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { i18n } from "@/app/i18n";

const playback = vi.hoisted(() => ({
  options: null as null | { source: unknown; isComplete: unknown; loadAll: () => Promise<unknown[]> },
}));
vi.mock("@/modules/queue/composables/useEntityPlayback", () => ({
  useEntityPlayback: (options: typeof playback.options) => {
    playback.options = options;
    return { playAll: vi.fn(), playTrack: vi.fn(), shuffle: vi.fn(), addToQueue: vi.fn() };
  },
}));

const queries = vi.hoisted(() => ({
  getAllTracksForQueue: vi.fn(async () => [{ id: "t-1" }]),
  getAllTrackIds: vi.fn(async () => []),
}));
vi.mock("@/queries/track.queries", () => queries);

vi.mock("@/components/ui/scrollable/useScrollRestoration", () => ({
  useScrollRestoration: () => ({ save: vi.fn(), restore: vi.fn() }),
}));

const indexPage = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return {
    isLoading: ref(false),
    tracks: ref<unknown[]>([{ id: "t-1" }]),
    hasNextPage: ref(true),
    searchQuery: null as null | { value: string },
  };
});
vi.mock("@/modules/tracks/composables/useIndexTracksPage", () => ({
  useIndexTracksPage: (sortKey: { value: string | null }, searchQuery: { value: string }) => ({
    ...(indexPage.searchQuery = searchQuery, {}),
    normalizedSearchQuery: computed(() => searchQuery.value.trim()),
    resolvedSortKey: computed(() => sortKey.value ?? "date_added_desc"),
    tracks: indexPage.tracks,
    total: ref(1),
    totalDuration: ref(0),
    isLoading: indexPage.isLoading,
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: indexPage.hasNextPage,
    isFetchingNextPage: ref(false),
  }),
}));

import AllMusicPage from "../AllMusicPage.vue";

const mountPage = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/");
  return mount(AllMusicPage, {
    shallow: true,
    global: { plugins: [createPinia(), router, i18n, [VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
};

describe("AllMusicPage playback", () => {
  beforeEach(() => {
    playback.options = null;
    indexPage.hasNextPage.value = true;
    queries.getAllTracksForQueue.mockClear();
  });

  // Same rules as every other list page: a fully loaded list plays by row
  // index, a partial one is played from the full set in the same sort.
  it("plays through the shared entity playback over the whole index", async () => {
    await mountPage();
    const options = playback.options!;

    expect(toValue(options.source)).toEqual({ type: "allMedia" });
    expect(toValue(options.isComplete)).toBe(false);
    indexPage.hasNextPage.value = false;
    expect(toValue(options.isComplete)).toBe(true);

    await options.loadAll();
    expect(queries.getAllTracksForQueue).toHaveBeenCalledWith("date_added_desc", "");
  });

  it("records a searched list as a search queue", async () => {
    await mountPage();
    indexPage.searchQuery!.value = "  hello ";

    expect(toValue(playback.options!.source)).toEqual({ type: "search" });
    await playback.options!.loadAll();
    expect(queries.getAllTracksForQueue).toHaveBeenCalledWith("date_added_desc", "hello");
  });
});
