import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import { QueryClient } from "@tanstack/vue-query";
import { TrackId } from "@/types/ids";

const repositories = vi.hoisted(() => ({
  trackRepository: {
    findAllIdsSorted: vi.fn(),
    findSortedByIds: vi.fn(),
    likeMany: vi.fn(),
    unlikeMany: vi.fn(),
  },
  albumRepository: { findByIds: vi.fn(async () => ok([])) },
  artistRepository: { findByIds: vi.fn(async () => ok([])) },
  coverRepository: {},
  offlineCopyRepository: {},
  playlistRepository: {},
}));

const search = vi.hoisted(() => ({
  searchDocuments: vi.fn(),
}));

vi.mock("@/db/repositories", () => repositories);
vi.mock("@/modules/search/service/searchIndex", () => ({
  searchDocuments: search.searchDocuments,
  searchTracks: vi.fn(),
  removeSearchDocuments: vi.fn(async () => {}),
  upsertSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/service/buildDocuments", () => ({
  buildArtistDoc: vi.fn(),
  buildAlbumDocFromDb: vi.fn(),
  buildTrackDocFromDb: vi.fn(),
}));

import * as cache from "../cache";
import { getAllTrackIds, setTracksLikedAndSync } from "../track.queries";

describe("bulk track queries", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
  });

  it("getAllTrackIds without a search goes through the id-only sorted query", async () => {
    repositories.trackRepository.findAllIdsSorted.mockResolvedValue(ok([TrackId("b"), TrackId("a")]));

    const ids = await getAllTrackIds("title_asc", "   ");

    expect(ids).toEqual(["b", "a"]);
    expect(repositories.trackRepository.findAllIdsSorted).toHaveBeenCalledWith("title_asc");
    expect(search.searchDocuments).not.toHaveBeenCalled();
  });

  it("getAllTrackIds with a search takes every matching document id from the index", async () => {
    search.searchDocuments.mockResolvedValue({
      results: [{ entityId: "x" }, { entityId: "y" }],
      total: 2,
      totalDuration: 0,
    });

    const ids = await getAllTrackIds("title_asc", "que");

    expect(ids).toEqual(["x", "y"]);
    expect(search.searchDocuments).toHaveBeenCalledWith("que", "track", { offset: 0 });
    expect(repositories.trackRepository.findAllIdsSorted).not.toHaveBeenCalled();
  });

  it("setTracksLikedAndSync(true) likes in one repository call and invalidates once", async () => {
    repositories.trackRepository.likeMany.mockResolvedValue(ok(2));
    const invalidate = vi.spyOn(cache, "invalidateForTrackMutation");

    const changed = await setTracksLikedAndSync(queryClient, [TrackId("a"), TrackId("b")], true);

    expect(changed).toBe(2);
    expect(repositories.trackRepository.likeMany).toHaveBeenCalledTimes(1);
    expect(repositories.trackRepository.likeMany.mock.calls[0][0]).toEqual(["a", "b"]);
    expect(repositories.trackRepository.unlikeMany).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(queryClient, { kind: "relations" });
  });

  it("setTracksLikedAndSync(false) unlikes", async () => {
    repositories.trackRepository.unlikeMany.mockResolvedValue(ok(1));

    const changed = await setTracksLikedAndSync(queryClient, [TrackId("a")], false);

    expect(changed).toBe(1);
    expect(repositories.trackRepository.unlikeMany).toHaveBeenCalledWith(["a"]);
    expect(repositories.trackRepository.likeMany).not.toHaveBeenCalled();
  });

  it("setTracksLikedAndSync with no ids does nothing", async () => {
    const invalidate = vi.spyOn(cache, "invalidateForTrackMutation");

    expect(await setTracksLikedAndSync(queryClient, [], true)).toBe(0);

    expect(repositories.trackRepository.likeMany).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
