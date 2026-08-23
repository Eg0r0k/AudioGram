import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { AlbumEntity, ArtistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumId, ArtistId, TrackId } from "@/types/ids";
import type { Track } from "@/modules/player/types";

const repositories = vi.hoisted(() => ({
  albumRepository: {
    findAllSortedByTitle: vi.fn(),
    findByIds: vi.fn(),
    findById: vi.fn(),
    findByArtistId: vi.fn(),
    create: vi.fn(),
  },
  artistRepository: {
    findByIds: vi.fn(),
    findByName: vi.fn(),
    create: vi.fn(),
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
    findById: vi.fn(),
    update: vi.fn(),
  },
  coverRepository: {
    findByOwner: vi.fn(),
    upsertOwnerCover: vi.fn(),
    deleteByOwner: vi.fn(),
  },
}));

vi.mock("@/db/repositories", () => repositories);
vi.mock("@/modules/search/searchIndex", () => ({
  searchTracks: vi.fn(),
  upsertSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/buildDocuments", () => ({
  buildArtistDoc: vi.fn((artist: ArtistEntity) => ({
    id: `artist:${artist.id}`,
    type: "artist",
    title: artist.name,
    entityId: artist.id,
  })),
  buildAlbumDocFromDb: vi.fn(async (album: AlbumEntity) => ({
    id: `album:${album.id}`,
    type: "album",
    title: album.title,
    entityId: album.id,
  })),
  buildTrackDocFromDb: vi.fn(async () => ({})),
}));

import { upsertSearchDocuments } from "@/modules/search/searchIndex";
import { queryKeys } from "@/queries/query-keys";
import {
  getTracksIndexPageData,
  getLikedTracksPageData,
  getLikedTracksPaginated,
  updateTrackMetadataAndSync,
} from "../track.queries";

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

  describe("updateTrackMetadataAndSync album by title", () => {
    const artist: ArtistEntity = {
      id: "artist-1" as ArtistId,
      name: "A",
      pinned: 1,
      addedAt: 1,
      updatedAt: 1,
    };

    const existingAlbum: AlbumEntity = {
      id: "album-1" as AlbumId,
      title: "Greatest Hits",
      artistId: artist.id,
      pinned: 1,
      addedAt: 1,
      updatedAt: 1,
    };

    const currentTrackEntity: TrackEntity = {
      id: "track-1" as TrackId,
      title: "Song",
      artistIds: [artist.id],
      albumId: "album-old" as AlbumId,
      albumTitle: "Old Album",
      artistName: "A",
      tagIds: [],
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      storagePath: "t.mp3",
      duration: 100,
      format: {},
      playCount: 0,
      addedAt: 1,
    };

    const track: Track = {
      kind: "library",
      id: currentTrackEntity.id,
      title: currentTrackEntity.title,
      artist: "A",
      artistIds: [artist.id],
      albumId: currentTrackEntity.albumId,
      albumName: "Old Album",
      storagePath: "t.mp3",
      source: TrackSource.LOCAL_INTERNAL,
      state: TrackState.READY,
      duration: 100,
      isLiked: false,
    };

    let queryClient: QueryClient;

    beforeEach(() => {
      queryClient = new QueryClient();
      repositories.trackRepository.findById.mockResolvedValue(ok(currentTrackEntity));
      repositories.trackRepository.update.mockResolvedValue(ok(1));
      repositories.artistRepository.findByName.mockResolvedValue(ok(artist));
    });

    it("reuses an existing album of the first artist matched case-insensitively", async () => {
      repositories.albumRepository.findByArtistId.mockResolvedValue(ok([existingAlbum]));

      const next = await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumTitle: "GREATEST HITS",
      });

      expect(next.albumId).toBe(existingAlbum.id);
      expect(repositories.albumRepository.create).not.toHaveBeenCalled();
    });

    it("creates a new album row when no identity match exists", async () => {
      repositories.albumRepository.findByArtistId.mockResolvedValue(ok([existingAlbum]));
      repositories.albumRepository.create.mockResolvedValue(ok("new-album" as AlbumId));
      // Seed the albums list cache like a previously-visited Albums page would,
      // so the point-sync has something to patch.
      queryClient.setQueryData(queryKeys.albums.all(), [existingAlbum]);

      const next = await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumTitle: "Brand New Album",
      });

      expect(repositories.albumRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Brand New Album",
          artistId: artist.id,
          pinned: 1,
        }),
      );
      const created = repositories.albumRepository.create.mock.calls[0][0] as AlbumEntity;
      expect(next.albumId).toBe(created.id);

      // The new album must be immediately visible in the Albums list cache,
      // not only reachable after a reload.
      expect(queryClient.getQueryData(queryKeys.albums.all())).toEqual([existingAlbum, created]);

      // And it must be searchable without waiting for a full reindex.
      expect(upsertSearchDocuments).toHaveBeenCalledWith([{
        id: `album:${created.id}`,
        type: "album",
        title: "Brand New Album",
        entityId: created.id,
      }]);
    });

    it("does not upsert an album search document or list cache when reusing an existing album", async () => {
      repositories.albumRepository.findByArtistId.mockResolvedValue(ok([existingAlbum]));
      queryClient.setQueryData(queryKeys.albums.all(), [existingAlbum]);

      await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumTitle: "GREATEST HITS",
      });

      expect(repositories.albumRepository.create).not.toHaveBeenCalled();
      expect(upsertSearchDocuments).not.toHaveBeenCalledWith([expect.objectContaining({ type: "album" })]);
      expect(queryClient.getQueryData(queryKeys.albums.all())).toEqual([existingAlbum]);
    });

    it("hands a track-owned cover over to the newly assigned album", async () => {
      // The editor requires an album, so fixing the tags of an album-less
      // import always assigns one — the embedded art must follow the track.
      const albumless: TrackEntity = { ...currentTrackEntity, albumId: "" as AlbumId, albumTitle: "" };
      repositories.trackRepository.findById.mockResolvedValue(ok(albumless));
      repositories.albumRepository.findById.mockResolvedValue(ok(existingAlbum));
      const coverBlob = new Blob([new Uint8Array(4)], { type: "image/webp" });
      repositories.coverRepository.findByOwner.mockImplementation(
        async (ownerType: string, ownerId: string) =>
          ok(ownerType === "track" && ownerId === albumless.id
            ? { id: "c1", ownerType, ownerId, blob: coverBlob, mimeType: "image/webp", addedAt: 1, updatedAt: 1 }
            : undefined),
      );
      repositories.coverRepository.upsertOwnerCover.mockResolvedValue(ok("c1"));
      repositories.coverRepository.deleteByOwner.mockResolvedValue(ok(undefined));

      await updateTrackMetadataAndSync(queryClient, { ...track, albumId: albumless.albumId }, {
        title: track.title,
        artistNames: ["A"],
        albumId: existingAlbum.id,
      });

      expect(repositories.coverRepository.upsertOwnerCover)
        .toHaveBeenCalledWith("album", existingAlbum.id, coverBlob);
      expect(repositories.coverRepository.deleteByOwner)
        .toHaveBeenCalledWith("track", albumless.id);
    });

    it("keeps the existing album cover and just drops the track-owned one", async () => {
      const albumless: TrackEntity = { ...currentTrackEntity, albumId: "" as AlbumId, albumTitle: "" };
      repositories.trackRepository.findById.mockResolvedValue(ok(albumless));
      repositories.albumRepository.findById.mockResolvedValue(ok(existingAlbum));
      const cover = (ownerType: string, ownerId: string) =>
        ({ id: `c-${ownerType}`, ownerType, ownerId, blob: new Blob(), mimeType: "image/webp", addedAt: 1, updatedAt: 1 });
      repositories.coverRepository.findByOwner.mockImplementation(
        async (ownerType: string, ownerId: string) => ok(cover(ownerType, ownerId)),
      );
      repositories.coverRepository.deleteByOwner.mockResolvedValue(ok(undefined));

      await updateTrackMetadataAndSync(queryClient, { ...track, albumId: albumless.albumId }, {
        title: track.title,
        artistNames: ["A"],
        albumId: existingAlbum.id,
      });

      expect(repositories.coverRepository.upsertOwnerCover).not.toHaveBeenCalled();
      expect(repositories.coverRepository.deleteByOwner)
        .toHaveBeenCalledWith("track", albumless.id);
    });

    it("persists trackNo and diskNo", async () => {
      repositories.albumRepository.findById.mockResolvedValue(ok(existingAlbum));

      const result = await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumId: existingAlbum.id,
        trackNo: 7,
        diskNo: 2,
      });

      expect(repositories.trackRepository.update).toHaveBeenCalledWith(
        currentTrackEntity.id,
        expect.objectContaining({ trackNo: 7, diskNo: 2 }),
      );
      expect(result.trackNo).toBe(7);
      expect(result.diskNo).toBe(2);
    });

    it("clears trackNo and diskNo when explicitly sent null", async () => {
      const trackWithNumbers: TrackEntity = {
        ...currentTrackEntity,
        trackNo: 3,
        diskNo: 1,
      };
      repositories.trackRepository.findById.mockResolvedValue(ok(trackWithNumbers));
      repositories.albumRepository.findById.mockResolvedValue(ok(existingAlbum));

      const result = await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumId: existingAlbum.id,
        trackNo: null,
        diskNo: null,
      });

      expect(repositories.trackRepository.update).toHaveBeenCalledWith(
        currentTrackEntity.id,
        expect.objectContaining({ trackNo: undefined, diskNo: undefined }),
      );
      expect(result.trackNo).toBeUndefined();
      expect(result.diskNo).toBeUndefined();
    });

    it("leaves trackNo and diskNo unchanged when omitted (undefined)", async () => {
      const trackWithNumbers: TrackEntity = {
        ...currentTrackEntity,
        trackNo: 3,
        diskNo: 1,
      };
      repositories.trackRepository.findById.mockResolvedValue(ok(trackWithNumbers));
      repositories.albumRepository.findById.mockResolvedValue(ok(existingAlbum));

      const result = await updateTrackMetadataAndSync(queryClient, track, {
        title: track.title,
        artistNames: ["A"],
        albumId: existingAlbum.id,
      });

      expect(repositories.trackRepository.update).toHaveBeenCalledWith(
        currentTrackEntity.id,
        expect.objectContaining({ trackNo: 3, diskNo: 1 }),
      );
      expect(result.trackNo).toBe(3);
      expect(result.diskNo).toBe(1);
    });
  });
});
