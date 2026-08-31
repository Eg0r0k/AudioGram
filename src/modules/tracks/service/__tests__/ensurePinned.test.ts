import { describe, expect, it, vi, beforeEach } from "vitest";
import { ok } from "neverthrow";
import { ndAlbumId, ndArtistId, ndTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources";

const repos = vi.hoisted(() => ({
  track: { findById: vi.fn(), upsert: vi.fn() },
  album: { findById: vi.fn(), upsert: vi.fn() },
  artist: { findByIds: vi.fn(), upsertMany: vi.fn(), findAll: vi.fn() },
}));

const uow = vi.hoisted(() => ({ runScoped: vi.fn() }));
const searchIndex = vi.hoisted(() => ({
  indexImportedTracks: vi.fn(async () => {}),
}));
const shadowCover = vi.hoisted(() => ({ ensureShadowCover: vi.fn(async () => {}) }));

vi.mock("@/db", () => ({ db: { tracks: {}, albums: {}, artists: {} } }));
vi.mock("@/db/repositories", () => ({
  trackRepository: repos.track,
  albumRepository: repos.album,
  artistRepository: repos.artist,
}));
vi.mock("@/db/unit-of-work", () => ({ unitOfWork: uow }));
vi.mock("@/modules/search/service/searchIndex", () => searchIndex);
vi.mock("../shadowAlbumCover", () => shadowCover);
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

import { ensurePinned } from "../ensurePinned";
import type { Track } from "@/modules/player/types";

const dto: SourceTrackDTO = {
  id: ndTrackId("song1"),
  title: "Remote Song",
  artistName: "Artist A",
  albumTitle: "Remote Album",
  albumId: ndAlbumId("album1"),
  artistIds: [ndArtistId("artist1")],
  duration: 240,
};

describe("ensurePinned", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uow.runScoped.mockImplementation(async (_tables: unknown, cb: () => Promise<unknown>) => ok(await cb()));
    repos.track.findById.mockResolvedValue(ok(undefined));
    repos.track.upsert.mockResolvedValue(ok("nd:song1"));
    repos.album.findById.mockResolvedValue(ok(undefined));
    repos.album.upsert.mockResolvedValue(ok("nd:album1"));
    repos.artist.findByIds.mockResolvedValue(ok([]));
    repos.artist.upsertMany.mockResolvedValue(ok(["nd:artist1"]));
    repos.artist.findAll.mockResolvedValue(ok([]));
  });

  it("returns library subjects untouched without touching the DB", async () => {
    const track = { kind: "library", id: "local-1" } as unknown as Track;

    const result = await ensurePinned({ kind: "library", track });

    expect(result).toBe(track);
    expect(uow.runScoped).not.toHaveBeenCalled();
  });

  it("rejects ephemeral subjects", async () => {
    await expect(ensurePinned({
      kind: "ephemeral",
      track: { kind: "ephemeral", id: "e", title: "t", source: { type: "url", url: "u" } },
    })).rejects.toThrow(/cannot be pinned/);
  });

  it("runs the whole cascade inside one unitOfWork transaction", async () => {
    const result = await ensurePinned({ kind: "remote", dto });

    expect(uow.runScoped).toHaveBeenCalledTimes(1);
    expect(repos.track.upsert).toHaveBeenCalledTimes(1);
    expect(repos.album.upsert).toHaveBeenCalledTimes(1);
    expect(repos.artist.upsertMany).toHaveBeenCalledTimes(1);

    expect(repos.track.upsert.mock.calls[0][0]).toMatchObject({ id: "nd:song1", pinned: 1 });
    expect(repos.album.upsert.mock.calls[0][0]).toMatchObject({ id: "nd:album1", pinned: 1 });
    expect(repos.artist.upsertMany.mock.calls[0][0][0]).toMatchObject({ id: "nd:artist1", name: "Artist A" });

    expect(result).toMatchObject({
      kind: "library",
      id: "nd:song1",
      title: "Remote Song",
      artist: "Artist A",
      albumName: "Remote Album",
      storagePath: "",
      pinned: 1,
    });
  });

  it("attaches the track to a same-named local artist instead of a shadow row", async () => {
    const localId = "a1b2c3d4-0000-0000-0000-000000000001";
    repos.artist.findAll.mockResolvedValue(ok([
      { id: localId, name: "ARTIST A", pinned: 1, addedAt: 1, updatedAt: 1 },
    ]));

    await ensurePinned({ kind: "remote", dto });

    expect(repos.track.upsert.mock.calls[0][0]).toMatchObject({ artistIds: [localId] });
    const upsertedArtists = repos.artist.upsertMany.mock.calls[0][0];
    expect(upsertedArtists.map((artist: { id: string }) => artist.id)).toEqual([localId]);
  });

  it("creates one artist row per credited name, '&' included, when the source knows no ids", async () => {
    repos.artist.upsertMany.mockResolvedValue(ok([]));

    await ensurePinned({
      kind: "remote",
      dto: { id: ndTrackId("song1"), title: "как же он силён", artistName: "СЕРЕГА ПИРАТ & Barikader" },
    });

    const upserted = repos.artist.upsertMany.mock.calls[0][0];
    expect(upserted.map((a: { name: string }) => a.name)).toEqual(["СЕРЕГА ПИРАТ", "Barikader"]);
    expect(repos.track.upsert.mock.calls[0][0]).toMatchObject({
      artistName: "СЕРЕГА ПИРАТ, Barikader",
      artistIds: upserted.map((a: { id: string }) => a.id),
    });
  });

  it("shadow-pins with pinned = 0 when requested", async () => {
    await ensurePinned({ kind: "remote", dto }, { pinned: 0 });

    expect(repos.track.upsert.mock.calls[0][0]).toMatchObject({ pinned: 0 });
  });

  it("looks the existing artists up by the track's own ids when the DTO carries none", async () => {
    repos.track.findById.mockResolvedValue(ok({
      id: "nd:song1",
      title: "Remote Song",
      artistIds: [ndArtistId("artist1"), ndArtistId("artist2")],
      albumId: "",
      pinned: 1,
    }));
    repos.artist.findByIds.mockResolvedValue(ok([
      { id: "nd:artist1", name: "Artist A", pinned: 1, addedAt: 1, updatedAt: 1 },
      { id: "nd:artist2", name: "Artist B", pinned: 1, addedAt: 1, updatedAt: 1 },
    ]));

    await ensurePinned({ kind: "remote", dto: { id: ndTrackId("song1"), title: "Remote Song" } }, { pinned: 0 });

    expect(repos.artist.findByIds).toHaveBeenCalledWith([ndArtistId("artist1"), ndArtistId("artist2")]);
    const upserted = repos.artist.upsertMany.mock.calls[0]?.[0] ?? [];
    expect(upserted.map((a: { name: string }) => a.name)).toEqual(["Artist A", "Artist B"]);
  });

  it("stores the cover on the shadow album when there is one", async () => {
    await ensurePinned({ kind: "remote", dto: { ...dto, coverRef: "https://covers/x.jpg" } });

    expect(shadowCover.ensureShadowCover).toHaveBeenCalledWith("album", "nd:album1", "https://covers/x.jpg");
  });

  it("stores the cover on the track itself when the DTO has no album", async () => {
    // A YouTube music video: artists known, no album — the cover must not be
    // dropped just because there is no album row to hang it on.
    await ensurePinned({
      kind: "remote",
      dto: { ...dto, albumId: undefined, albumTitle: undefined, coverRef: "https://covers/x.jpg" },
    });

    expect(shadowCover.ensureShadowCover).toHaveBeenCalledWith("track", "nd:song1", "https://covers/x.jpg");
  });

  it("propagates a failed transaction", async () => {
    uow.runScoped.mockResolvedValue({ isErr: () => true, error: new Error("tx failed") });

    await expect(ensurePinned({ kind: "remote", dto })).rejects.toThrow("tx failed");
  });
});
