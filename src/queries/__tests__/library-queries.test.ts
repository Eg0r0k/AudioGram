import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/vue-query";
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
    it("should remove all library queries", async () => {
      await clearLibraryData(queryClient);

      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.library.summary(),
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.artists.all(),
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.albums.all(),
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.all(),
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.tracks.all(),
      });
    });

    it("should invalidate queries after removing", async () => {
      await clearLibraryData(queryClient);

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.library.summary(),
      });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.artists.all(),
      });
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
