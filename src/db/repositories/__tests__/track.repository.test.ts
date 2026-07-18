import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumId, ArtistId } from "@/types/ids";

const table = vi.hoisted(() => {
  const keysMock = vi.fn();
  const toArrayMock = vi.fn();
  const equalsToArrayMock = vi.fn();
  const anyOfMock = vi.fn(() => ({ keys: keysMock, toArray: toArrayMock }));
  const equalsMock = vi.fn(() => ({ toArray: equalsToArrayMock }));
  const whereMock = vi.fn(() => ({ anyOf: anyOfMock, equals: equalsMock }));
  return { keysMock, toArrayMock, equalsToArrayMock, anyOfMock, equalsMock, whereMock };
});

vi.mock("@/db", () => ({
  db: {
    tracks: {
      where: table.whereMock,
    },
  },
}));

import { trackRepository } from "../track.repository";

describe("trackRepository count-by-ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("countByAlbumIds counts via index keys without materializing entities", async () => {
    // album-a has 3 tracks, album-b has 0 → keys() yields one entry per matching track.
    table.keysMock.mockResolvedValue(["album-a", "album-a", "album-a"]);

    const result = await trackRepository.countByAlbumIds(["album-a", "album-b"] as AlbumId[]);

    expect(result.isOk()).toBe(true);
    const counts = result._unsafeUnwrap();
    expect(counts.get("album-a" as AlbumId)).toBe(3);
    expect(counts.get("album-b" as AlbumId)).toBe(0);

    expect(table.whereMock).toHaveBeenCalledWith("albumId");
    expect(table.anyOfMock).toHaveBeenCalledWith(["album-a", "album-b"]);
    expect(table.keysMock).toHaveBeenCalledOnce();
    expect(table.toArrayMock).not.toHaveBeenCalled();
  });

  it("countByAlbumIds returns empty map without touching the table for empty input", async () => {
    const result = await trackRepository.countByAlbumIds([]);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().size).toBe(0);
    expect(table.whereMock).not.toHaveBeenCalled();
    expect(table.keysMock).not.toHaveBeenCalled();
    expect(table.toArrayMock).not.toHaveBeenCalled();
  });

  it("countByArtistIds counts multi-entry index keys without materializing entities", async () => {
    // artist-1 appears on 2 tracks, artist-2 on 0 → keys() yields one artistId per index entry.
    table.keysMock.mockResolvedValue(["artist-1", "artist-1"]);

    const result = await trackRepository.countByArtistIds(["artist-1", "artist-2"] as ArtistId[]);

    expect(result.isOk()).toBe(true);
    const counts = result._unsafeUnwrap();
    expect(counts.get("artist-1" as ArtistId)).toBe(2);
    expect(counts.get("artist-2" as ArtistId)).toBe(0);

    expect(table.whereMock).toHaveBeenCalledWith("artistIds");
    expect(table.toArrayMock).not.toHaveBeenCalled();
  });
});

describe("trackRepository.findByAlbumIdPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // where("albumId").equals(id).toArray() returns the album rows in arbitrary
    // (index/pk) order; the repository sorts them by (diskNo ?? 1, trackNo).
    table.equalsToArrayMock.mockResolvedValue([
      { id: "t3", trackNo: 3 },
      { id: "t1", trackNo: 1 },
      { id: "t2", trackNo: 2 },
    ]);
  });

  it("returns the first page globally ordered by trackNo", async () => {
    const result = await trackRepository.findByAlbumIdPaginated("album-1" as AlbumId, 0, 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(t => t.trackNo)).toEqual([1, 2]);

    expect(table.whereMock).toHaveBeenCalledWith("albumId");
    expect(table.equalsMock).toHaveBeenCalledWith("album-1");
  });

  it("returns the second page globally ordered by trackNo", async () => {
    const result = await trackRepository.findByAlbumIdPaginated("album-1" as AlbumId, 2, 2);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(t => t.trackNo)).toEqual([3]);
  });

  it("orders by (diskNo, trackNo) so disc 1 track 2 precedes disc 2 track 1", async () => {
    table.equalsToArrayMock.mockResolvedValue([
      { id: "d2t1", diskNo: 2, trackNo: 1 },
      { id: "d1t2", diskNo: 1, trackNo: 2 },
      { id: "d1t1", diskNo: 1, trackNo: 1 },
    ]);

    const result = await trackRepository.findByAlbumIdPaginated("album-1" as AlbumId, 0, 3);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(t => t.id)).toEqual(["d1t1", "d1t2", "d2t1"]);
  });
});

describe("trackRepository.findByAlbumId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("orders by (diskNo, trackNo) and places tracks without a number first", async () => {
    table.equalsToArrayMock.mockResolvedValue([
      { id: "t2", trackNo: 2 },
      { id: "noNo" }, // trackNo undefined → treated as 0, must not break the sort
      { id: "d2t1", diskNo: 2, trackNo: 1 },
      { id: "t1", trackNo: 1 },
    ]);

    const result = await trackRepository.findByAlbumId("album-1" as AlbumId);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().map(t => t.id)).toEqual(["noNo", "t1", "t2", "d2t1"]);
  });
});
