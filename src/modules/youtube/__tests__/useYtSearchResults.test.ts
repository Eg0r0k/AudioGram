import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { okAsync } from "neverthrow";
import { queryKeys } from "@/queries/query-keys";

vi.mock("@/lib/logger", () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));
vi.mock("@/modules/sources/registry", () => ({
  sources: { get: () => ({ isAvailable: true, searchPage: () => okAsync({ items: [], cursor: null }) }) },
}));
vi.mock("../provider", () => ({
  youtubeProvider: {
    searchVideos: vi.fn(() => okAsync({ items: [], continuation: undefined })),
    continueVideos: vi.fn(),
  },
}));

import { useYtSearchResults } from "../composables/useYtSearchResults";

const flush = async () => {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
};

describe("useYtSearchResults", () => {
  // The app-wide default is "always" (Dexie must read offline); a YouTube
  // search still has to wait for the network, or it fails instantly offline.
  it("keeps the video search waiting for the network", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mount(defineComponent({
      setup() {
        useYtSearchResults(ref("videos"), ref("q"));
        return () => h("div");
      },
    }), { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
    await flush();

    const query = queryClient.getQueryCache().find({ queryKey: queryKeys.youtube.videoSearch("q") });
    expect(query?.options.networkMode).toBe("online");
  });
});
