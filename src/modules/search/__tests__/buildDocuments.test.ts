import { describe, expect, it, vi } from "vitest";
import type { AlbumEntity, ArtistEntity, PlaylistEntity, TrackEntity } from "@/db/entities";
import { TrackSource, TrackState } from "@/db/entities";
import { buildAlbumDoc, buildPlaylistDoc, buildTrackDoc } from "../service/buildDocuments";

vi.mock("@/db", () => ({ db: {} }));

const artist = { id: "ar1", name: "Portishead", pinned: 1, addedAt: 0, updatedAt: 0 } as ArtistEntity;
const album = { id: "al1", title: "Dummy", artistId: "ar1", year: 1994, pinned: 1, addedAt: 0, updatedAt: 0 } as AlbumEntity;
const artistMap = new Map([[artist.id, artist]]);
const albumMap = new Map([[album.id, album]]);

const track = (overrides: Partial<TrackEntity>): TrackEntity => ({
  id: "t1",
  title: "Glory Box",
  artistName: "Portishead",
  albumTitle: "Dummy",
  artistIds: ["ar1"],
  albumId: "al1",
  tagIds: [],
  source: TrackSource.LOCAL_INTERNAL,
  pinned: 1,
  state: TrackState.READY,
  duration: 300,
  format: {},
  playCount: 0,
  addedAt: 0,
  ...overrides,
} as TrackEntity);

describe("buildDocuments extra fields", () => {
  it("album document carries the release year", () => {
    expect(buildAlbumDoc(album, artistMap).year).toBe(1994);
  });

  it("track document carries the album year and the bare file name", () => {
    const doc = buildTrackDoc(track({ storagePath: "C:/Music/Portishead/08 - Glory Box.flac" }), artistMap, albumMap);

    expect(doc.year).toBe(1994);
    expect(doc.fileName).toBe("08 - Glory Box");
  });

  it("track document has no file name for remote tracks", () => {
    const doc = buildTrackDoc(track({ storagePath: undefined, source: TrackSource.REMOTE_SUBSONIC }), artistMap, albumMap);

    expect(doc.fileName).toBeUndefined();
  });

  it("playlist document carries the description", () => {
    const playlist = { id: "p1", name: "Roadtrip", description: "songs for the highway", trackIds: [], addedAt: 0, updatedAt: 0 } as PlaylistEntity;

    expect(buildPlaylistDoc(playlist).description).toBe("songs for the highway");
  });
});
