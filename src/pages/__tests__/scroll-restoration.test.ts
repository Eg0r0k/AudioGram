import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, ref, toValue } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia } from "pinia";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { i18n } from "@/app/i18n";

const restoration = vi.hoisted(() => ({ calls: [] as { key?: unknown; ready?: unknown; deps?: unknown }[] }));

vi.mock("@/components/ui/scrollable/useScrollRestoration", () => ({
  useScrollRestoration: (_target: unknown, options: Record<string, unknown> = {}) => {
    restoration.calls.push(options);
    return { save: vi.fn(), restore: vi.fn() };
  },
}));

const likedPage = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return { isLoading: ref(true), tracks: ref<unknown[]>([]) };
});
vi.mock("@/modules/favorite/composables/useLikedTracksPage", () => ({
  useLikedTracksPage: () => ({
    tracks: likedPage.tracks,
    likedData: computed(() => ({ type: "liked", title: "Liked", image: "", trackCount: 0, duration: "" })),
    isLoading: likedPage.isLoading,
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: ref(false),
    isFetchingNextPage: ref(false),
  }),
}));

const indexPage = await vi.hoisted(async () => {
  const { ref } = await import("vue");
  return { isLoading: ref(true), tracks: ref<unknown[]>([]) };
});
vi.mock("@/modules/tracks/composables/useIndexTracksPage", () => ({
  useIndexTracksPage: (sortKey: { value: string | null }, searchQuery: { value: string }) => ({
    normalizedSearchQuery: computed(() => searchQuery.value.trim()),
    resolvedSortKey: computed(() => sortKey.value ?? "date_added_desc"),
    tracks: indexPage.tracks,
    total: ref(0),
    totalDuration: ref(0),
    isLoading: indexPage.isLoading,
    isError: ref(false),
    error: ref(null),
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: ref(false),
    isFetchingNextPage: ref(false),
  }),
}));

import FavoritePage from "../FavoritePage.vue";
import AllMusicPage from "../AllMusicPage.vue";

const mountPage = async (page: typeof FavoritePage | typeof AllMusicPage) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
  });
  await router.push("/");
  return mount(page, {
    shallow: true,
    global: { plugins: [createPinia(), router, i18n, [VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
};

const lastOptions = () => restoration.calls[restoration.calls.length - 1]!;

describe("scroll restoration wiring", () => {
  beforeEach(() => {
    restoration.calls.length = 0;
    likedPage.isLoading.value = true;
    likedPage.tracks.value = [];
    indexPage.isLoading.value = true;
    indexPage.tracks.value = [];
  });

  it("the liked page saves its position per sort and waits for the rows", async () => {
    await mountPage(FavoritePage);
    const options = lastOptions();

    expect(toValue(options.key)).toBe("liked:default");
    expect(toValue(options.ready)).toBe(false);
    likedPage.isLoading.value = false;
    likedPage.tracks.value = [{}, {}];
    expect(toValue(options.ready)).toBe(true);
    expect(toValue(options.deps)).toBe(2);
  });

  it("the all-music page saves its position per sort and search", async () => {
    await mountPage(AllMusicPage);
    const options = lastOptions();

    expect(toValue(options.key)).toBe("all-music:date_added_desc:");
    expect(toValue(options.ready)).toBe(false);
    indexPage.isLoading.value = false;
    indexPage.tracks.value = [{}];
    expect(toValue(options.ready)).toBe(true);
    expect(toValue(options.deps)).toBe(1);
  });
});
