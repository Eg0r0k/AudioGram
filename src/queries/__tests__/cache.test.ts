import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../query-keys";
import {
  syncArtistCaches,
  removeArtistCaches,
  syncAlbumCaches,
  removeAlbumCaches,
  syncPlaylistCaches,
  removePlaylistCaches,
  syncTrackLikeCaches,
  syncTrackMetadataCaches,
  removeTracksFromCaches,
} from "../cache";
import { TrackSource, TrackState } from "@/db/entities";
import type { TrackEntity, ArtistEntity, AlbumEntity, PlaylistEntity } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import type { ArtistId, AlbumId, PlaylistId, TrackId } from "@/types/ids";

const createMockQueryClient = (): QueryClient => {
  return {
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    removeQueries: vi.fn(),
  } as unknown as QueryClient;
};

function getQueryDataMock(queryClient: QueryClient) {
  return queryClient.getQueryData as unknown as Mock;
}

function setQueriesDataMock(queryClient: QueryClient) {
  return queryClient.setQueriesData as unknown as Mock;
}

describe("cache utils", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createMockQueryClient();
    vi.clearAllMocks();
  });

  describe("syncArtistCaches", () => {
    it("should update artist cache in all relevant queries", () => {
      const artist: ArtistEntity = {
        id: "artist-1" as ArtistId,
        name: "Test Artist",
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };

      syncArtistCaches(queryClient, artist);

      expect(queryClient.setQueryData).toHaveBeenCalledWith(
        queryKeys.artists.detail(artist.id),
        artist,
      );
    });
  });

  describe("removeArtistCaches", () => {
    it("should remove artist caches", () => {
      const artistId = "artist-1" as ArtistId;

      removeArtistCaches(queryClient, artistId);

      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.artists.detail(artistId),
        exact: true,
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.artists.page(artistId),
        exact: true,
      });
    });
  });

  describe("syncAlbumCaches", () => {
    it("should update album cache", () => {
      const album: AlbumEntity = {
        id: "album-1" as AlbumId,
        title: "Test Album",
        artistId: "artist-1" as ArtistId,
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };

      syncAlbumCaches(queryClient, album);

      expect(queryClient.setQueryData).toHaveBeenCalledWith(
        queryKeys.albums.detail(album.id),
        album,
      );
    });
  });

  describe("removeAlbumCaches", () => {
    it("should remove album caches", () => {
      const albumId = "album-1" as AlbumId;
      const artistId = "artist-1" as ArtistId;

      removeAlbumCaches(queryClient, albumId, artistId);

      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.albums.detail(albumId),
        exact: true,
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.albums.page(albumId),
        exact: true,
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.albums.tracks(albumId),
        exact: true,
      });
    });
  });

  describe("syncPlaylistCaches", () => {
    it("should update playlist cache", () => {
      const playlist: PlaylistEntity = {
        id: "playlist-1" as PlaylistId,
        name: "Test Playlist",
        trackIds: [],
        addedAt: Date.now(),
        updatedAt: Date.now(),
      };

      syncPlaylistCaches(queryClient, playlist);

      expect(queryClient.setQueryData).toHaveBeenCalledWith(
        queryKeys.playlists.detail(playlist.id),
        playlist,
      );
    });
  });

  describe("removePlaylistCaches", () => {
    it("should remove playlist caches", () => {
      const playlistId = "playlist-1" as PlaylistId;

      removePlaylistCaches(queryClient, playlistId);

      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.detail(playlistId),
        exact: true,
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.page(playlistId),
        exact: true,
      });
      expect(queryClient.removeQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.playlists.tracks(playlistId),
        exact: true,
      });
    });
  });

  describe("syncTrackLikeCaches", () => {
    it("should sync liked track to cache", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: 0,
        format: {},
        playCount: 0,
        likedAt: Date.now(),
        addedAt: Date.now(),
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: TrackState.READY,
        duration: trackEntity.duration,
        isLiked: true,
      };

      getQueryDataMock(queryClient).mockImplementation((key: unknown) => {
        if (JSON.stringify(key).includes("tracks")) {
          return [trackEntity];
        }
        return undefined;
      });

      syncTrackLikeCaches(queryClient, trackEntity, track);

      expect(queryClient.setQueryData).toHaveBeenCalled();
    });

    it("should update infinite liked tracks queries when liking a track", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: TrackState.READY,
        format: {},

        playCount: 0,
        likedAt: Date.now(),
        addedAt: Date.now(),
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: trackEntity.state,
        duration: trackEntity.duration,
        isLiked: true,
      };

      getQueryDataMock(queryClient).mockImplementation(() => undefined);
      setQueriesDataMock(queryClient).mockImplementation(() => undefined);

      syncTrackLikeCaches(queryClient, trackEntity, track);

      expect(queryClient.setQueriesData).toHaveBeenCalled();

      const calls = setQueriesDataMock(queryClient).mock.calls;
      const infiniteQueryCall = calls.find((call: unknown[]) => {
        const filters = call[0] as { predicate?: (query: { queryKey: (string | number)[] }) => boolean };
        return filters?.predicate && filters.predicate({ queryKey: ["tracks", "liked", "page", "infinite", 0] });
      });

      expect(infiniteQueryCall).toBeDefined();
    });

    it("should add track to beginning of liked tracks when liking", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: TrackState.READY,
        format: {},

        playCount: 0,
        likedAt: Date.now(),
        addedAt: Date.now(),
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: trackEntity.state,
        duration: trackEntity.duration,
        isLiked: true,
      };

      const existingTracks = [
        { id: "track-2" as TrackId, title: "Existing Track", isLiked: true, duration: 200 },
      ];

      getQueryDataMock(queryClient).mockImplementation(() => undefined);

      const setQueriesDataCalls: { filters: unknown; updater: (data: unknown) => unknown }[] = [];
      setQueriesDataMock(queryClient).mockImplementation((filters: unknown, updater: (data: unknown) => unknown) => {
        setQueriesDataCalls.push({ filters, updater });
        return undefined;
      });

      syncTrackLikeCaches(queryClient, trackEntity, track);

      const infiniteQueryCall = setQueriesDataCalls.find((call) => {
        const filters = call.filters as { predicate?: (query: { queryKey: (string | number)[] }) => boolean };
        return filters?.predicate && filters.predicate({ queryKey: ["tracks", "liked", "page", "infinite", 0] });
      });

      expect(infiniteQueryCall).toBeDefined();

      const result = infiniteQueryCall!.updater({
        pages: [{ tracks: existingTracks, nextOffset: null, total: existingTracks.length }],
        pageParams: [0],
      }) as { pages: Array<{ tracks: Track[] }> };

      expect(result.pages[0].tracks[0].id).toBe(track.id);
      expect(result.pages[0].tracks.length).toBe(2);
    });

    it("should remove track from liked tracks when unliking", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: TrackState.READY,
        format: {},

        playCount: 0,
        likedAt: undefined,
        addedAt: Date.now(),
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: trackEntity.state,
        duration: trackEntity.duration,
        isLiked: false,
      };

      const existingTracks = [
        { id: "track-1" as TrackId, title: "Test Track", isLiked: true, duration: 180 },
        { id: "track-2" as TrackId, title: "Existing Track", isLiked: true, duration: 200 },
      ];

      getQueryDataMock(queryClient).mockImplementation(() => undefined);

      const setQueriesDataCalls: { filters: unknown; updater: (data: unknown) => unknown }[] = [];
      setQueriesDataMock(queryClient).mockImplementation((filters: unknown, updater: (data: unknown) => unknown) => {
        setQueriesDataCalls.push({ filters, updater });
        return undefined;
      });

      syncTrackLikeCaches(queryClient, trackEntity, track);

      const infiniteQueryCall = setQueriesDataCalls.find((call) => {
        const filters = call.filters as { predicate?: (query: { queryKey: (string | number)[] }) => boolean };
        return filters?.predicate && filters.predicate({ queryKey: ["tracks", "liked", "page", "infinite", 0] });
      });

      expect(infiniteQueryCall).toBeDefined();

      const result = infiniteQueryCall!.updater({
        pages: [{ tracks: existingTracks, nextOffset: null, total: existingTracks.length }],
        pageParams: [0],
      }) as { pages: Array<{ tracks: Track[] }> };

      expect(result.pages[0].tracks.length).toBe(1);
      expect(result.pages[0].tracks[0].id).toBe("track-2");
    });

    it("should update artist, album and playlist infinite track pages", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: TrackState.READY,
        format: {},

        playCount: 0,
        likedAt: Date.now(),
        addedAt: Date.now(),
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: trackEntity.state,
        duration: trackEntity.duration,
        isLiked: true,
      };

      const setQueriesDataCalls: { filters: unknown; updater: (data: unknown) => unknown }[] = [];
      setQueriesDataMock(queryClient).mockImplementation((filters: unknown, updater: (data: unknown) => unknown) => {
        setQueriesDataCalls.push({ filters, updater });
        return undefined;
      });

      syncTrackLikeCaches(queryClient, trackEntity, track);

      const matchUpdater = (queryKey: (string | number)[]) => {
        const call = setQueriesDataCalls.find((entry) => {
          const filters = entry.filters as { predicate?: (query: { queryKey: (string | number)[] }) => boolean };
          return filters.predicate?.({ queryKey });
        });

        expect(call).toBeDefined();

        return call!.updater({
          pages: [{
            tracks: [{ ...track, isLiked: false }],
            nextOffset: null,
            total: 1,
          }],
          pageParams: [0],
        }) as { pages: Array<{ tracks: Track[] }> };
      };

      expect(matchUpdater(["artists", track.artistIds[0], "tracks", "page"]).pages[0].tracks[0].isLiked).toBe(true);
      expect(matchUpdater(["albums", track.albumId, "tracks", "page"]).pages[0].tracks[0].isLiked).toBe(true);
      expect(matchUpdater(["playlists", "playlist-1", "tracks", "page"]).pages[0].tracks[0].isLiked).toBe(true);
    });
  });

  describe("syncTrackMetadataCaches", () => {
    it("should sync track metadata to cache", () => {
      const trackEntity: TrackEntity = {
        id: "track-1" as TrackId,
        title: "Test Track",
        artistIds: ["artist-1" as ArtistId],
        albumId: "album-1" as AlbumId,
        tagIds: [],
        duration: 180,
        source: TrackSource.LOCAL_INTERNAL,
        storagePath: "path",
        state: TrackState.READY,
        format: {},

        playCount: 0,
        addedAt: Date.now(),
        lyricsPath: "lyrics/track.lrc",
      };

      const track: Track = {
        id: trackEntity.id,
        kind: "library",
        title: trackEntity.title,
        artist: "Artist",
        artistIds: trackEntity.artistIds,
        albumId: trackEntity.albumId,
        albumName: "Album",
        storagePath: "path",
        source: trackEntity.source,
        state: trackEntity.state,
        duration: trackEntity.duration,
        isLiked: false,
        lyricsPath: "lyrics/track.lrc",
      };

      syncTrackMetadataCaches(queryClient, trackEntity, track);

      expect(queryClient.setQueryData).toHaveBeenCalledWith(
        queryKeys.tracks.detail(trackEntity.id),
        trackEntity,
      );
    });
  });

  describe("removeTracksFromCaches", () => {
    it("should remove tracks from all caches", () => {
      const trackIds = ["track-1" as TrackId, "track-2" as TrackId];

      getQueryDataMock(queryClient).mockImplementation(() => {
        return { pages: [], pageParams: [] };
      });
      setQueriesDataMock(queryClient).mockReturnValue(undefined);

      removeTracksFromCaches(queryClient, trackIds);

      expect(queryClient.setQueriesData).toHaveBeenCalled();
    });
  });
});

describe("cache aggregate-key isolation (regression)", () => {
  it("unlike does not corrupt the index totalDuration aggregate", () => {
    const queryClient = new QueryClient();

    // A scalar aggregate that shares the ["tracks","index"] prefix with the pages.
    queryClient.setQueryData(queryKeys.tracks.indexTotalDuration(""), 12345);
    queryClient.setQueryData(queryKeys.tracks.likedPageInfinite(), {
      pages: [{ tracks: [{ id: "track-1", isLiked: true, duration: 180 }], nextOffset: null, total: 1 }],
      pageParams: [0],
    });

    const trackEntity: TrackEntity = {
      id: "track-1" as TrackId,
      title: "Test Track",
      artistIds: ["artist-1" as ArtistId],
      albumId: "album-1" as AlbumId,
      tagIds: [],
      duration: 180,
      source: TrackSource.LOCAL_INTERNAL,
      storagePath: "path",
      state: TrackState.READY,
      format: {},
      playCount: 0,
      likedAt: undefined,
      addedAt: 1,
    };
    const track: Track = {
      id: trackEntity.id,
      kind: "library",
      title: trackEntity.title,
      artist: "Artist",
      artistIds: trackEntity.artistIds,
      albumId: trackEntity.albumId,
      albumName: "Album",
      storagePath: "path",
      source: trackEntity.source,
      state: trackEntity.state,
      duration: trackEntity.duration,
      isLiked: false,
    };

    expect(() => syncTrackLikeCaches(queryClient, trackEntity, track)).not.toThrow();
    expect(queryClient.getQueryData(queryKeys.tracks.indexTotalDuration(""))).toBe(12345);
  });
});
