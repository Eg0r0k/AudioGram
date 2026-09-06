import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { TrackId } from "@/types/ids";
import {
  clearLibraryData,
  invalidateLibraryData,
} from "../library.queries";
import { queryKeys } from "../query-keys";
vi.mock("@/modules/covers/lib/cover-cache", () => ({
  coverCache: { invalidateAll: vi.fn(), invalidate: vi.fn(), set: vi.fn() },
}));
import { coverCache } from "@/modules/covers/lib/cover-cache";

const createMockQueryClient = (): QueryClient => {
  const mocks = {
    removeQueries: vi.fn().mockResolvedValue(undefined),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
  };
  return mocks as unknown as QueryClient;
};

describe("library.queries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createMockQueryClient();
    vi.clearAllMocks();
  });

  describe("clearLibraryData", () => {
    const flush = async () => {
      for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0));
    };

    // The whole database was wiped, so nothing cached is true any more —
    // whatever it was keyed under. A mounted list must not keep showing the
    // deleted rows: its query is reset and read again, not removed from under
    // it (removeQueries leaves the observer holding the old data).
    it("drops every cached answer and re-reads the observed ones", async () => {
      const realClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const reads: number[] = [];
      const observer = new QueryObserver(realClient, {
        queryKey: queryKeys.library.summary(),
        queryFn: async () => {
          reads.push(reads.length + 1);
          return reads.length;
        },
      });
      const unsubscribe = observer.subscribe(() => {});
      await flush();
      expect(observer.getCurrentResult().data).toBe(1);
      realClient.setQueryData(queryKeys.trackChapters.detail(TrackId("t-1")), [{ time: 1 }]);
      realClient.setQueryData(queryKeys.stats.streaks(), { current: 3 });

      await clearLibraryData(realClient);
      await flush();

      expect(observer.getCurrentResult().data).toBe(2);
      expect(realClient.getQueryData(queryKeys.trackChapters.detail(TrackId("t-1")))).toBeUndefined();
      expect(realClient.getQueryData(queryKeys.stats.streaks())).toBeUndefined();
      expect(coverCache.invalidateAll).toHaveBeenCalled();
      unsubscribe();
    });
  });

  describe("invalidateLibraryData", () => {
    it("should invalidate all library queries", async () => {
      await invalidateLibraryData(queryClient);

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.library.summary(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.artists.all(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.albums.all(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.all(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.tracks.all(),
      });
      // Covers live outside vue-query: the cover cache is told instead.
      expect(coverCache.invalidateAll).toHaveBeenCalled();
    });
  });
});
