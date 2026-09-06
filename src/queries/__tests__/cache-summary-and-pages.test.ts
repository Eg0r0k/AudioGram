import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import type { AlbumEntity, ArtistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { AlbumId, ArtistId, TrackId } from "@/types/ids";
import { queryKeys } from "../query-keys";
import {
  removeTracksFromCaches,
  syncAlbumCaches,
  syncArtistCaches,
  syncTrackLikeCaches,
} from "../cache";
import type { LibrarySummaryData } from "../types";

const artistId = ArtistId("a-1");
const albumId = AlbumId("al-1");

const artist: ArtistEntity = { id: artistId, name: "Local", pinned: 1, addedAt: 1, updatedAt: 1 };
const album: AlbumEntity = { id: albumId, title: "Album", artistId, pinned: 1, addedAt: 1, updatedAt: 1 };

const summary = (overrides: Partial<LibrarySummaryData> = {}): LibrarySummaryData => ({
  artists: [{ ...artist, trackCount: 7 }],
  albums: [{ ...album, trackCount: 3 }],
  playlists: [],
  folders: [],
  likedCount: 4,
  ...overrides,
});

const entity = (id: string, likedAt?: number): TrackEntity => ({
  id: TrackId(id),
  title: id,
  artistIds: [artistId],
  albumId,
  tagIds: [],
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  storagePath: "p",
  duration: 10,
  format: {},
  playCount: 0,
  addedAt: 1,
  likedAt,
} as TrackEntity);

const row = (id: string, isLiked: boolean): Track => ({
  id: TrackId(id),
  kind: "library",
  title: id,
  artist: "Local",
  artistIds: [artistId],
  albumId,
  albumName: "Album",
  storagePath: "p",
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 10,
  isLiked,
});

const seed = (data: LibrarySummaryData = summary()) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(queryKeys.library.summary(), data);
  return queryClient;
};

const summaryOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<LibrarySummaryData>(queryKeys.library.summary())!;

describe("summary counts survive a point-sync", () => {
  it("keeps an artist's trackCount when its row is re-synced", () => {
    const queryClient = seed();
    syncArtistCaches(queryClient, { ...artist, name: "Renamed" });
    expect(summaryOf(queryClient).artists[0]).toMatchObject({ name: "Renamed", trackCount: 7 });
  });

  it("keeps an album's trackCount when its row is re-synced", () => {
    const queryClient = seed();
    syncAlbumCaches(queryClient, { ...album, title: "Renamed" });
    expect(summaryOf(queryClient).albums[0]).toMatchObject({ title: "Renamed", trackCount: 3 });
  });

  it("a created artist enters the summary with a zero trackCount", () => {
    const queryClient = seed();
    syncArtistCaches(queryClient, { ...artist, id: ArtistId("a-2"), name: "New" });
    expect(summaryOf(queryClient).artists[1]).toMatchObject({ id: "a-2", trackCount: 0 });
  });

  it("a like moves the summary's likedCount by one", () => {
    const queryClient = seed();
    syncTrackLikeCaches(queryClient, entity("t-1", 5), row("t-1", true));
    expect(summaryOf(queryClient).likedCount).toBe(5);
    syncTrackLikeCaches(queryClient, entity("t-1"), row("t-1", false));
    expect(summaryOf(queryClient).likedCount).toBe(4);
  });
});
