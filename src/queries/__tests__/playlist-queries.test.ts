import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "neverthrow";
import type { AlbumEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";

const repositories = vi.hoisted(() => ({
  playlistRepository: { findById: vi.fn() },
  trackRepository: { findByIds: vi.fn() },
  artistRepository: { findByIds: vi.fn() },
  albumRepository: { findByIds: vi.fn() },
}));

vi.mock("@/db/repositories", () => repositories);

import { getPlaylistTracksPaginated } from "../playlist.queries";

const album: AlbumEntity = {
  id: "album-1" as AlbumId,
  title: "Album",
  artistId: "artist-1" as ArtistId,
  addedAt: 1,
  updatedAt: 1,
};

function makePlaylist(trackIds: string[]): PlaylistEntity {
  return {
    id: "pl-1" as PlaylistId,
    name: "Playlist",
    trackIds: trackIds as TrackId[],
    addedAt: 1,
    updatedAt: 1,
  };
}

function makeTrackEntity(id: string): TrackEntity {
  return {
    id: id as TrackId,
    title: id,
    artistIds: ["artist-1" as ArtistId],
    albumId: album.id,
    albumTitle: album.title,
    tagIds: [],
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    storagePath: `${id}.mp3`,
    duration: 100,
    format: {},
    playCount: 0,
    addedAt: 1,
  };
}

describe("getPlaylistTracksPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repositories.artistRepository.findByIds.mockResolvedValue(ok([]));
    repositories.albumRepository.findByIds.mockResolvedValue(ok([album]));
  });

  it("without sortKey fetches only the page's ids, not the whole playlist", async () => {
    const trackIds = Array.from({ length: 200 }, (_, i) => `t${i}`);
    const pageIds = trackIds.slice(50, 100);

    repositories.playlistRepository.findById.mockResolvedValue(ok(makePlaylist(trackIds)));
    repositories.trackRepository.findByIds.mockResolvedValue(ok(pageIds.map(makeTrackEntity)));

    const result = await getPlaylistTracksPaginated("pl-1" as PlaylistId, 50, 50, null);

    expect(repositories.trackRepository.findByIds).toHaveBeenCalledTimes(1);
    expect(repositories.trackRepository.findByIds).toHaveBeenCalledWith(pageIds);
    expect(result.tracks).toHaveLength(50);
    expect(result.total).toBe(200);
    expect(result.nextOffset).toBe(100);
  });
});
