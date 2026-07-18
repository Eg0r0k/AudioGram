import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtistId } from "@/types/ids";

const table = vi.hoisted(() => {
  const sortByMock = vi.fn();
  const equalsMock = vi.fn(() => ({ sortBy: sortByMock }));
  const whereMock = vi.fn(() => ({ equals: equalsMock }));
  return { sortByMock, equalsMock, whereMock };
});

vi.mock("@/db", () => ({
  db: {
    albums: {
      where: table.whereMock,
    },
  },
}));

import { albumRepository } from "../album.repository";

describe("albumRepository.findByArtistIdPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Dexie sortBy("year") returns the artist's albums globally ordered ascending
    // by year, regardless of insertion order (3, 1, 2). The method reverses to get
    // newest-first, so the effective order is 3, 2, 1.
    table.sortByMock.mockResolvedValue([
      { id: "a1", year: 1 },
      { id: "a2", year: 2 },
      { id: "a3", year: 3 },
    ]);
  });

  it("returns the first page globally ordered by year (newest first)", async () => {
    const result = await albumRepository.findByArtistIdPaginated("artist-1" as ArtistId, 0, 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(a => a.year)).toEqual([3, 2]);

    expect(table.whereMock).toHaveBeenCalledWith("artistId");
    expect(table.equalsMock).toHaveBeenCalledWith("artist-1");
    expect(table.sortByMock).toHaveBeenCalledWith("year");
  });

  it("returns the second page globally ordered by year (newest first)", async () => {
    const result = await albumRepository.findByArtistIdPaginated("artist-1" as ArtistId, 2, 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(a => a.year)).toEqual([1]);
  });
});
