import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/vue-query";
import { TrackSource, TrackState, type AlbumEntity, type ArtistEntity, type PlaylistEntity, type TrackEntity } from "@/db/entities";
import type { AlbumId, ArtistId, PlaylistId, TrackId } from "@/types/ids";
import type { Track } from "@/modules/player/types";

//
// Mutations that touch many rows must do it as one indexed write inside a
// transaction — not one update per row. The per-row repository methods are
// spied on to prove the N+1 path is gone.
//

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/modules/search/service/searchIndex", () => ({
  removeSearchDocuments: vi.fn(async () => {}),
  upsertSearchDocuments: vi.fn(async () => {}),
}));
vi.mock("@/modules/search/service/buildDocuments", () => ({
  buildAlbumDocFromDb: vi.fn(async () => ({})),
  buildArtistDoc: vi.fn(() => ({})),
  buildTrackDocFromDb: vi.fn(async () => ({})),
}));

import { db } from "@/db";
import { playlistRepository, trackRepository } from "@/db/repositories";
import { updateAlbumAndSync } from "../album.queries";
import { updateArtistAndSync } from "../artist.queries";
import { addTracksToPlaylistAndSync } from "../playlist.queries";
import { addTracksToAlbumAndSync, addTracksToArtistAndSync, favoriteTracksAndSync } from "../track.queries";

const AR1 = "ar1" as ArtistId;
const AR2 = "ar2" as ArtistId;
const AL1 = "al1" as AlbumId;

const artist = (id: ArtistId, name: string): ArtistEntity => ({ id, name, pinned: 1, addedAt: 1, updatedAt: 1 });
const album = (id: AlbumId, title: string, artistId: ArtistId): AlbumEntity =>
  ({ id, title, artistId, pinned: 1, addedAt: 1, updatedAt: 1 });
const track = (id: string, overrides: Partial<TrackEntity> = {}): TrackEntity => ({
  id: id as TrackId,
  title: id,
  artistName: "Artist One",
  albumTitle: "Old Title",
  artistIds: [AR1],
  albumId: AL1,
  tagIds: [],
  source: TrackSource.LOCAL_INTERNAL,
  pinned: 1,
  state: TrackState.READY,
  storagePath: `tracks/${id}.mp3`,
  duration: 100,
  format: {},
  playCount: 0,
  addedAt: 1,
  ...overrides,
});
const asPlayerTrack = (id: string): Track => ({ id, isLiked: false } as unknown as Track);

describe("bulk writes (integration)", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.restoreAllMocks();
    queryClient = new QueryClient();
    await db.open();
    await Promise.all(db.tables.map(table => table.clear()));
    await db.artists.bulkAdd([artist(AR1, "Artist One"), artist(AR2, "Artist Two")]);
    await db.albums.add(album(AL1, "Old Title", AR1));
    await db.tracks.bulkAdd([track("t1"), track("t2"), track("t3", { albumId: "" as AlbumId, albumTitle: "" })]);
  });

  it("album rename rewrites every track's albumTitle without per-track updates", async () => {
    const perRow = vi.spyOn(trackRepository, "update");

    await updateAlbumAndSync(queryClient, album(AL1, "Old Title", AR1), { title: "New Title" });

    expect(perRow).not.toHaveBeenCalled();
    expect((await db.albums.get(AL1))?.title).toBe("New Title");
    expect((await db.tracks.where("albumId").equals(AL1).toArray()).map(t => t.albumTitle)).toEqual(["New Title", "New Title"]);
    expect((await db.tracks.get("t3" as TrackId))?.albumTitle).toBe("");
  });

  it("artist rename rewrites the joined artistName of their tracks in one batch", async () => {
    await db.tracks.put(track("t2", { artistIds: [AR1, AR2], artistName: "Artist One, Artist Two" }));
    const perRow = vi.spyOn(trackRepository, "update");

    await updateArtistAndSync(queryClient, artist(AR1, "Artist One"), { name: "Renamed" });

    expect(perRow).not.toHaveBeenCalled();
    expect((await db.tracks.get("t1" as TrackId))?.artistName).toBe("Renamed");
    expect((await db.tracks.get("t2" as TrackId))?.artistName).toBe("Renamed, Artist Two");
  });

  it("favoriteTracksAndSync likes the batch with one write", async () => {
    await db.tracks.put(track("t2", { likedAt: 5 }));
    const perRow = vi.spyOn(trackRepository, "setLiked");

    await favoriteTracksAndSync(queryClient, ["t1", "t2", "t3"].map(asPlayerTrack));

    expect(perRow).not.toHaveBeenCalled();
    const rows = await db.tracks.bulkGet(["t1", "t2", "t3"] as TrackId[]);
    expect(rows.map(r => r?.likedAt)).toEqual([expect.any(Number), 5, expect.any(Number)]);
  });

  it("addTracksToPlaylistAndSync appends the batch with one row write", async () => {
    const playlist: PlaylistEntity = { id: "p1" as PlaylistId, name: "P", trackIds: ["t1" as TrackId], addedAt: 1, updatedAt: 1 };
    await db.playlists.add(playlist);
    const perRow = vi.spyOn(playlistRepository, "addTrack");

    const next = await addTracksToPlaylistAndSync(queryClient, playlist.id, ["t2", "t1", "t3"].map(asPlayerTrack));

    expect(perRow).not.toHaveBeenCalled();
    expect(next.trackIds).toEqual(["t1", "t2", "t3"]);
    expect((await db.playlists.get(playlist.id))?.trackIds).toEqual(["t1", "t2", "t3"]);
  });

  it("addTracksToAlbumAndSync moves the batch with one bulk update", async () => {
    await db.albums.add(album("al2" as AlbumId, "Second", AR2));
    const perRow = vi.spyOn(trackRepository, "update");

    await addTracksToAlbumAndSync(queryClient, "al2" as AlbumId, ["t1", "t3"].map(asPlayerTrack));

    expect(perRow).not.toHaveBeenCalled();
    const t1 = await db.tracks.get("t1" as TrackId);
    expect(t1).toMatchObject({ albumId: "al2", albumTitle: "Second", artistIds: [AR2, AR1], artistName: "Artist Two, Artist One" });
    expect(await db.tracks.get("t3" as TrackId)).toMatchObject({ albumId: "al2", albumTitle: "Second" });
    expect((await db.tracks.get("t2" as TrackId))?.albumId).toBe(AL1);
  });

  it("addTracksToArtistAndSync credits the batch with one bulk update", async () => {
    const perRow = vi.spyOn(trackRepository, "update");

    await addTracksToArtistAndSync(queryClient, AR2, ["t1", "t2"].map(asPlayerTrack));

    expect(perRow).not.toHaveBeenCalled();
    expect(await db.tracks.get("t1" as TrackId)).toMatchObject({ artistIds: [AR1, AR2], artistName: "Artist One, Artist Two" });
    expect((await db.tracks.get("t3" as TrackId))?.artistIds).toEqual([AR1]);
  });
});
