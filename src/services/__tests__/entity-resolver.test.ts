import { describe, expect, it, vi } from "vitest";
import type { ArtistEntity } from "@/db/entities";
import { ArtistId } from "@/types/ids";
import { ytAlbumId, ytArtistId, ytTrackId } from "@/types/track-ref";
import type { SourceTrackDTO } from "@/modules/sources";
import { substituteLocalArtists } from "../entity-resolver";

vi.mock("@/db", () => ({ db: {} }));

const localId = ArtistId("41180b61-7c4a-44aa-bcd7-166e6b0e4b50");

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

describe("substituteLocalArtists", () => {
  it("swaps a remote artist id for a same-named local artist (case-insensitive)", () => {
    const result = substituteLocalArtists(dto, [artist(localId, "СЕРЕГА ПИРАТ")]);

    expect(result.artistIds).toEqual([localId]);
  });

  it("keeps the remote id when no local artist matches", () => {
    const result = substituteLocalArtists(dto, [artist(localId, "Кто-то другой")]);

    expect(result.artistIds).toEqual([ytArtistId("UC1")]);
  });

  it("never swaps onto another remote-prefixed artist", () => {
    const ndArtist = artist(ArtistId("nd:x9") as ArtistId, "Серега Пират");

    const result = substituteLocalArtists(dto, [ndArtist]);

    expect(result.artistIds).toEqual([ytArtistId("UC1")]);
  });

  it("passes through DTOs without artist ids", () => {
    const bare: SourceTrackDTO = { id: ytTrackId("v2"), title: "T2" };

    expect(substituteLocalArtists(bare, [artist(localId, "X")])).toBe(bare);
  });
});
