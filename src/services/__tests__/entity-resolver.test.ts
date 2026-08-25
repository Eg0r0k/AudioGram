import { describe, expect, it, vi } from "vitest";
import type { ArtistEntity } from "@/db/entities";
import { ArtistId } from "@/types/ids";
import { ndArtistId, ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources";
import { alignArtists, splitArtistNames } from "../entity-resolver";

vi.mock("@/db", () => ({ db: {} }));

const localId = ArtistId("41180b61-7c4a-44aa-bcd7-166e6b0e4b50");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function artist(id: ArtistId, name: string): ArtistEntity {
  return { id, name, pinned: 1, addedAt: 1, updatedAt: 1 };
}

const dto: SourceTrackDTO = {
  id: ytTrackId("v1"),
  title: "T",
  artistName: "Серега Пират",
  albumTitle: "A",
  albumId: ytAlbumId("MPREb_1"),
  artistIds: [ytArtistId("UC1")],
};

describe("splitArtistNames", () => {
  it("splits on comma, semicolon and ampersand, trimming and de-duplicating", () => {
    expect(splitArtistNames("СЕРЕГА ПИРАТ & Barikader")).toEqual(["СЕРЕГА ПИРАТ", "Barikader"]);
    expect(splitArtistNames("A, B; C &D")).toEqual(["A", "B", "C", "D"]);
    expect(splitArtistNames("Markul, NIKER, markul")).toEqual(["Markul", "NIKER"]);
    expect(splitArtistNames(" , ")).toEqual([]);
    expect(splitArtistNames(undefined)).toEqual([]);
  });
});

describe("alignArtists", () => {
  it("swaps a remote artist id for a same-named local artist (case-insensitive)", () => {
    const result = alignArtists(dto, [artist(localId, "СЕРЕГА ПИРАТ")]);

    expect(result.artistIds).toEqual([localId]);
  });

  it("keeps the remote id when no local artist matches", () => {
    const result = alignArtists(dto, [artist(localId, "Кто-то другой")]);

    expect(result.artistIds).toEqual([ytArtistId("UC1")]);
  });

  it("never swaps an aligned id onto another source's shadow", () => {
    const ndArtist = artist(ndArtistId("x9"), "Серега Пират");

    const result = alignArtists(dto, [ndArtist]);

    expect(result.artistIds).toEqual([ytArtistId("UC1")]);
  });

  it("passes through DTOs without artist names", () => {
    const bare: SourceTrackDTO = { id: ytTrackId("v2"), title: "T2", artistIds: [ytArtistId("UC1")] };

    expect(alignArtists(bare, [artist(localId, "X")])).toBe(bare);
  });

  it("gives every name of an '&' collab its own row when the source has one entity for both", () => {
    // YT Music files "СЕРЕГА ПИРАТ & Barikader" as a single artist with a
    // single id; the library wants two artists.
    const collab = { ...dto, artistName: "СЕРЕГА ПИРАТ & Barikader", artistIds: [ytArtistId("UCcollab")] };

    const result = alignArtists(collab, []);

    expect(result.artistName).toBe("СЕРЕГА ПИРАТ, Barikader");
    expect(result.artistIds).toHaveLength(2);
    expect(result.artistIds?.every(id => UUID.test(id))).toBe(true);
  });

  it("creates local rows for names the source has no ids for", () => {
    const noIds = { ...dto, artistName: "Markul, NIKER", artistIds: undefined };

    const result = alignArtists(noIds, []);

    expect(result.artistIds).toHaveLength(2);
    expect(result.artistIds?.every(id => UUID.test(id))).toBe(true);
  });

  it("reuses a same-named shadow of the same source when ids do not line up", () => {
    const pirate = artist(ytArtistId("UCpirate"), "СЕРЕГА ПИРАТ");
    const collab = { ...dto, artistName: "СЕРЕГА ПИРАТ & Barikader", artistIds: [ytArtistId("UCcollab")] };

    const result = alignArtists(collab, [pirate]);

    expect(result.artistIds?.[0]).toBe(ytArtistId("UCpirate"));
    expect(UUID.test(result.artistIds?.[1] ?? "")).toBe(true);
  });

  it("prefers a local artist over the source's own aligned id", () => {
    const paired = { ...dto, artistName: "Markul, NIKER", artistIds: [ytArtistId("UCm"), ytArtistId("UCn")] };

    const result = alignArtists(paired, [artist(localId, "niker")]);

    expect(result.artistIds).toEqual([ytArtistId("UCm"), localId]);
  });
});
