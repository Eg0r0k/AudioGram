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

vi.mock("@/db", () => ({ db: { tracks: {}, albums: {}, artists: {} } }));
vi.mock("@/db/repositories", () => ({
  trackRepository: repos.track,
  albumRepository: repos.album,
  artistRepository: repos.artist,
}));
vi.mock("@/db/unit-of-work", () => ({ unitOfWork: uow }));

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

  it("shadow-pins with pinned = 0 when requested", async () => {
    await ensurePinned({ kind: "remote", dto }, { pinned: 0 });

    expect(repos.track.upsert.mock.calls[0][0]).toMatchObject({ pinned: 0 });
  });

  it("propagates a failed transaction", async () => {
    uow.runScoped.mockResolvedValue({ isErr: () => true, error: new Error("tx failed") });

    await expect(ensurePinned({ kind: "remote", dto })).rejects.toThrow("tx failed");
  });
});
