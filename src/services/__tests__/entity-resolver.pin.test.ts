import { describe, expect, it } from "vitest";
import { TrackSource, TrackState, type ArtistEntity, type TrackEntity } from "@/db/entities";
import { AlbumId, ArtistId } from "@/types/ids";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources";
import { buildRemoteShadowEntities, type RemotePinExisting } from "../entity-resolver";

const NOW = 1_700_000_000_000;

const dto: SourceTrackDTO = {
  id: ndTrackId("song1"),
  title: "Remote Song",
  artistName: "Artist A, Artist B",
  albumTitle: "Remote Album",
  albumId: ndAlbumId("album1"),
  artistIds: [ndArtistId("artist1"), ndArtistId("artist2")],
  duration: 240,
  trackNo: 3,
};

const noExisting: RemotePinExisting = { track: undefined, album: undefined, artists: new Map() };

describe("buildRemoteShadowEntities", () => {
  it("builds the full cascade with deterministic prefixed ids", () => {
    const rows = buildRemoteShadowEntities(dto, 1, noExisting, NOW);

    expect(rows.track).toMatchObject({
      id: "nd:song1",
      title: "Remote Song",
      albumId: "nd:album1",
      artistIds: ["nd:artist1", "nd:artist2"],
      source: TrackSource.REMOTE_SUBSONIC,
      pinned: 1,
      state: TrackState.READY,
      duration: 240,
      trackNo: 3,
      playCount: 0,
      addedAt: NOW,
    });
    expect(rows.track.storagePath).toBeUndefined();
    expect(rows.album).toMatchObject({
      id: "nd:album1",
      title: "Remote Album",
      artistId: "nd:artist1",
      pinned: 1,
    });
    expect(rows.artists.map(a => [a.id, a.name, a.pinned])).toEqual([
      ["nd:artist1", "Artist A", 1],
      ["nd:artist2", "Artist B", 1],
    ]);
  });

  it("maps yt ids onto REMOTE_YT and tolerates a DTO without album/artists", () => {
    const rows = buildRemoteShadowEntities(
      { id: "yt:abc" as SourceTrackDTO["id"], title: "Video" },
      0,
      noExisting,
      NOW,
    );

    expect(rows.track.source).toBe(TrackSource.REMOTE_YT);
    expect(rows.track.pinned).toBe(0);
    expect(rows.track.albumId).toBe(AlbumId(""));
    expect(rows.track.artistIds).toEqual([]);
    expect(rows.album).toBeNull();
    expect(rows.artists).toEqual([]);
  });

  it("never writes an album row it cannot title — the track stays album-less instead", () => {
    // YT/ND can hand over an album id with an empty (or missing) title; a
    // blank album row would show up as an empty entry in the album picker.
    const untitled: SourceTrackDTO = { ...dto, albumTitle: "" };

    const rows = buildRemoteShadowEntities(untitled, 1, noExisting, NOW);

    expect(rows.album).toBeNull();
    expect(rows.track.albumId).toBe(AlbumId(""));
    expect(rows.track.albumTitle).toBe("");
  });

  it("keeps the album when the DTO lacks a title but the existing row has one", () => {
    const existing: RemotePinExisting = {
      ...noExisting,
      album: { id: ndAlbumId("album1"), title: "Known", artistId: ndArtistId("artist1"), pinned: 0, addedAt: 1, updatedAt: 1 },
    };

    const rows = buildRemoteShadowEntities({ ...dto, albumTitle: undefined }, 1, existing, NOW);

    expect(rows.album?.title).toBe("Known");
    expect(rows.track.albumId).toBe("nd:album1");
    expect(rows.track.albumTitle).toBe("Known");
  });

  it("preserves user state on the existing row and refreshes the snapshot", () => {
    const existingTrack: TrackEntity = {
      id: ndTrackId("song1"),
      title: "Old title",
      artistIds: [ndArtistId("artist1")],
      albumId: ndAlbumId("album1"),
      tagIds: ["tag-1" as never],
      source: TrackSource.REMOTE_SUBSONIC,
      pinned: 0,
      state: TrackState.READY,
      duration: 100,
      format: { codec: "flac" },
      likedAt: 123,
      playCount: 7,
      lastPlayedAt: 456,
      addedAt: 1,
      lyricsPath: "lyrics/song1.lrc",
    };

    const rows = buildRemoteShadowEntities(dto, 1, { ...noExisting, track: existingTrack }, NOW);

    expect(rows.track.title).toBe("Remote Song");
    expect(rows.track.duration).toBe(240);
    expect(rows.track.pinned).toBe(1);
    expect(rows.track.likedAt).toBe(123);
    expect(rows.track.playCount).toBe(7);
    expect(rows.track.lastPlayedAt).toBe(456);
    expect(rows.track.tagIds).toEqual(["tag-1"]);
    expect(rows.track.addedAt).toBe(1);
    expect(rows.track.lyricsPath).toBe("lyrics/song1.lrc");
  });

  it("a shadow request never downgrades an existing pinned = 1 row", () => {
    const pinnedArtist: ArtistEntity = {
      id: ndArtistId("artist1"),
      name: "Existing Artist",
      pinned: 1,
      addedAt: 1,
      updatedAt: 1,
    };
    const existing: RemotePinExisting = {
      track: { ...buildRemoteShadowEntities(dto, 1, noExisting, 1).track },
      album: { ...buildRemoteShadowEntities(dto, 1, noExisting, 1).album! },
      artists: new Map([[pinnedArtist.id, pinnedArtist]]),
    };

    const rows = buildRemoteShadowEntities(dto, 0, existing, NOW);

    expect(rows.track.pinned).toBe(1);
    expect(rows.album?.pinned).toBe(1);
    expect(rows.artists[0]?.pinned).toBe(1);
    expect(rows.artists[0]?.name).toBe("Existing Artist");
    expect(rows.artists[1]?.pinned).toBe(0);
  });

  it("never writes an artist row it cannot name — the id is dropped instead", () => {
    // One display name, two ids: the second has no name to take. An empty
    // artist row renders as a blank entry in the library and never heals.
    const rows = buildRemoteShadowEntities(
      { ...dto, artistName: "NIKER", albumId: undefined, albumTitle: undefined },
      1,
      noExisting,
      NOW,
    );

    expect(rows.artists.map(a => [a.id, a.name])).toEqual([["nd:artist1", "NIKER"]]);
    expect(rows.track.artistIds).toEqual(["nd:artist1"]);
  });

  it("keeps the existing rows' names and links when the DTO carries no artists at all", () => {
    const existingTrack = buildRemoteShadowEntities(dto, 1, noExisting, 1).track;
    const existingArtists = buildRemoteShadowEntities(dto, 1, noExisting, 1).artists;
    const existing: RemotePinExisting = {
      track: existingTrack,
      album: undefined,
      artists: new Map(existingArtists.map(a => [a.id, a])),
    };

    const rows = buildRemoteShadowEntities(
      { id: dto.id, title: "Remote Song (replayed)" },
      0,
      existing,
      NOW,
    );

    expect(rows.track.artistIds).toEqual(["nd:artist1", "nd:artist2"]);
    expect(rows.artists.map(a => a.name)).toEqual(["Artist A", "Artist B"]);
  });

  it("rejects local ids", () => {
    expect(() =>
      buildRemoteShadowEntities({ id: "plain-uuid" as SourceTrackDTO["id"], title: "X" }, 1, noExisting, NOW),
    ).toThrow(/Not a remote track id/);
  });
});
