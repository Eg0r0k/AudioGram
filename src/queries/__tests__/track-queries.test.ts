import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { AlbumEntity, ArtistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";

const repositories = vi.hoisted(() => ({
  albumRepository: {
    findAllSortedByTitle: vi.fn(),
    findByIds: vi.fn(),
  },
  artistRepository: {
    findByIds: vi.fn(),
  },
  trackRepository: {
    findByAlbumId: vi.fn(),
    findSortedByIds: vi.fn(),
    countAll: vi.fn(),
    sumDurationAll: vi.fn(),
    findAllSortedPaginated: vi.fn(),
    findLiked: vi.fn(),
    findLikedSorted: vi.fn(),
    findLikedSortedPaginated: vi.fn(),
    findLikedPaginated: vi.fn(),
    countLiked: vi.fn(),
    sumDurationByLiked: vi.fn(),
  },
}));

vi.mock("@/db/repositories", () => repositories);
vi.mock("@/modules/search/searchIndex", () => ({
  searchTracks: vi.fn(),
  upsertSearchDocuments: vi.fn(),
}));

import { getTracksIndexPageData, getLikedTracksPageData, getLikedTracksPaginated } from "../track.queries";

describe("track.queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tracks in Dexie album order for album_asc", async () => {
    const albumB: AlbumEntity = {
      id: "album-b" as AlbumId,
      title: "B Album",
      artistId: "artist-1" as ArtistId,
      addedAt: 1,
      updatedAt: 1,
    };

    const albumA: AlbumEntity = {
      id: "album-a" as AlbumId,
      title: "A Album",
      artistId: "artist-1" as ArtistId,
      addedAt: 1,
      updatedAt: 1,
    };

    const artist: ArtistEntity = {
      id: "artist-1" as ArtistId,
      name: "Artist",
      addedAt: 1,
      updatedAt: 1,
    };

    const trackA: TrackEntity = {
      id: "track-a" as TrackId,
      title: "Track A",
      artistIds: [artist.id],
      albumId: albumA.id,
      tagIds: [],
      source: 0,
      state: 0,
      storagePath: "a.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
      albumTitle: albumA.title,
    };

    const trackB: TrackEntity = {
      id: "track-b" as TrackId,
      title: "Track B",
      artistIds: [artist.id],
      albumId: albumB.id,
      tagIds: [],
      source: 0,
      state: 0,
      storagePath: "b.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
      albumTitle: albumB.title,
    };

    repositories.trackRepository.findAllSortedPaginated.mockResolvedValue(ok([trackA, trackB]));
    repositories.artistRepository.findByIds.mockResolvedValue(ok([artist]));
    repositories.albumRepository.findByIds.mockResolvedValue(ok([albumA, albumB]));
    repositories.trackRepository.countAll.mockResolvedValue(ok(2));
    repositories.trackRepository.sumDurationAll.mockResolvedValue(ok(200));

    const result = await getTracksIndexPageData("album_asc");

    expect(repositories.trackRepository.findAllSortedPaginated).toHaveBeenCalledWith("album_asc", 0, 50);
    expect(result.tracks.map(track => track.id)).toEqual([trackA.id, trackB.id]);
    expect(result.total).toBe(2);
  });

  describe("getLikedTracksPageData", () => {
    const artist: ArtistEntity = {
      id: "artist-1" as ArtistId,
      name: "Artist",
      addedAt: 1,
      updatedAt: 1,
    };

    const album: AlbumEntity = {
      id: "album-1" as AlbumId,
      title: "Album",
      artistId: artist.id,
      addedAt: 1,
      updatedAt: 1,
    };

    const trackA: TrackEntity = {
      id: "track-a" as TrackId,
      title: "Track A",
      artistIds: [artist.id],
      albumId: album.id,
      albumTitle: album.title,
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "a.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
      likedAt: 100,
    };

    const trackB: TrackEntity = {
      id: "track-b" as TrackId,
      title: "Track B",
      artistIds: [artist.id],
      albumId: album.id,
      albumTitle: album.title,
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "b.mp3",
      duration: 200,
      format: {},
      playCount: 0,
      addedAt: 2,
      likedAt: 200,
    };

    const likedTracks = [trackA, trackB];

    beforeEach(() => {
      repositories.artistRepository.findByIds.mockResolvedValue(ok([artist]));
      repositories.albumRepository.findByIds.mockResolvedValue(ok([album]));
    });

    it("without sortKey calls findLiked() and returns mapped tracks", async () => {
      repositories.trackRepository.findLiked.mockResolvedValue(ok(likedTracks));

      const result = await getLikedTracksPageData();

      expect(repositories.trackRepository.findLiked).toHaveBeenCalledOnce();
      expect(repositories.trackRepository.findLikedSorted).not.toHaveBeenCalled();
      expect(result.tracks.map(t => t.id)).toEqual([trackA.id, trackB.id]);
      expect(result.tracks.every(t => t.isLiked)).toBe(true);
    });

    it("with sortKey calls findLikedSorted() and returns mapped tracks", async () => {
      repositories.trackRepository.findLikedSorted.mockResolvedValue(ok(likedTracks));

      const result = await getLikedTracksPageData("title_asc");

      expect(repositories.trackRepository.findLikedSorted).toHaveBeenCalledWith("title_asc");
      expect(repositories.trackRepository.findLiked).not.toHaveBeenCalled();
      expect(result.tracks.map(t => t.id)).toEqual([trackA.id, trackB.id]);
    });
  });

  describe("getLikedTracksPaginated", () => {
    const artist: ArtistEntity = {
      id: "artist-1" as ArtistId,
      name: "Artist",
      addedAt: 1,
      updatedAt: 1,
    };

    const album: AlbumEntity = {
      id: "album-1" as AlbumId,
      title: "Album",
      artistId: artist.id,
      addedAt: 1,
      updatedAt: 1,
    };

    const track: TrackEntity = {
      id: "track-1" as TrackId,
      title: "Track",
      artistIds: [artist.id],
      albumId: album.id,
      albumTitle: album.title,
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "t.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
      likedAt: 100,
    };

    beforeEach(() => {
      repositories.artistRepository.findByIds.mockResolvedValue(ok([artist]));
      repositories.albumRepository.findByIds.mockResolvedValue(ok([album]));
    });

    it("without sortKey calls findLikedPaginated + countLiked, not sumDurationByLiked", async () => {
      repositories.trackRepository.findLikedPaginated.mockResolvedValue(ok([track]));
      repositories.trackRepository.countLiked.mockResolvedValue(ok(1));
      repositories.trackRepository.sumDurationByLiked.mockResolvedValue(ok(100));

      const result = await getLikedTracksPaginated(0, 50);

      expect(repositories.trackRepository.findLikedPaginated).toHaveBeenCalledWith(0, 50);
      expect(repositories.trackRepository.countLiked).toHaveBeenCalledOnce();
      expect(repositories.trackRepository.sumDurationByLiked).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.tracks).toHaveLength(1);
    });

    it("with sortKey calls findLikedSortedPaginated instead of double-fetch", async () => {
      repositories.trackRepository.findLikedSortedPaginated.mockResolvedValue(ok([track]));
      repositories.trackRepository.countLiked.mockResolvedValue(ok(1));
      repositories.trackRepository.sumDurationByLiked.mockResolvedValue(ok(100));

      const result = await getLikedTracksPaginated(0, 50, "title_asc");

      expect(repositories.trackRepository.findLikedSortedPaginated).toHaveBeenCalledWith("title_asc", 0, 50);
      expect(repositories.trackRepository.findLiked).not.toHaveBeenCalled();
      expect(repositories.trackRepository.findSortedByIds).not.toHaveBeenCalled();
      expect(result.tracks).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("returns nextOffset=null when no more pages", async () => {
      repositories.trackRepository.findLikedPaginated.mockResolvedValue(ok([track]));
      repositories.trackRepository.countLiked.mockResolvedValue(ok(1));
      repositories.trackRepository.sumDurationByLiked.mockResolvedValue(ok(100));

      const result = await getLikedTracksPaginated(0, 50);

      expect(result.nextOffset).toBeNull();
    });

    it("returns nextOffset when more pages exist", async () => {
      repositories.trackRepository.findLikedPaginated.mockResolvedValue(ok([track]));
      repositories.trackRepository.countLiked.mockResolvedValue(ok(100));
      repositories.trackRepository.sumDurationByLiked.mockResolvedValue(ok(10000));

      const result = await getLikedTracksPaginated(0, 50);

      expect(result.nextOffset).toBe(50);
    });
  });

  describe("getTracksIndexPageData aggregate gating", () => {
    beforeEach(() => {
      repositories.artistRepository.findByIds.mockResolvedValue(ok([]));
      repositories.albumRepository.findByIds.mockResolvedValue(ok([]));
      repositories.trackRepository.findAllSortedPaginated.mockResolvedValue(ok([]));
      repositories.trackRepository.countAll.mockResolvedValue(ok(0));
      repositories.trackRepository.sumDurationAll.mockResolvedValue(ok(0));
    });

    it("computes sumDurationAll on the first page (offset 0)", async () => {
      await getTracksIndexPageData("date_added_desc", "", 0, 50);

      expect(repositories.trackRepository.sumDurationAll).toHaveBeenCalledOnce();
    });

    it("does not compute sumDurationAll on later pages (offset 50)", async () => {
      const result = await getTracksIndexPageData("date_added_desc", "", 50, 50);

      expect(repositories.trackRepository.sumDurationAll).not.toHaveBeenCalled();
      expect(result.totalDuration).toBe(0);
    });
  });
});
