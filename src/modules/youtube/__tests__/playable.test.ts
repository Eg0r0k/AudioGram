import { describe, expect, it, vi } from "vitest";
import type { YtMusicTrack } from "../types";

// The row builder needs the media-server base for the stream URL; the
// proxied-cover path is gated off (IS_TAURI false → no ytimg route).
vi.mock("@/lib/environment/userAgent", () => ({ IS_TAURI: false, IS_MOBILE: false }));
import { setMediaServerBaseForTests } from "@/lib/stream-url";
import {
  playableFromMusicTrack,
  ytDownloadDto,
  ytEphemeralTrack,
  ytMusicTrackToDto,
} from "../lib/playable";

setMediaServerBaseForTests("http://127.0.0.1:4321/tok");

//
// Search rows stream as ephemeral tracks, but downloading one must still pin
// the full catalog identity (artist + album ids) — otherwise the copy lands
// in the library with no artist, no album and therefore no cover.
//

const musicTrack: YtMusicTrack = {
  id: "AP0gmnh_RFQ",
  title: "Я взлетаю вверх",
  artists: [{ id: "UCTLkOu1J8aNJhEiWFWbMnVQ", name: "Серега Пират" }],
  album: { id: "MPREb_1", name: "Я взлетаю вверх" },
  duration: 159,
  thumbnail: "https://yt3.googleusercontent.com/cover=w120-h120",
  isVideo: false,
  trackNr: null,
};

describe("ytDownloadDto", () => {
  it("uses the catalog DTO carried by a search row", () => {
    const playable = playableFromMusicTrack(musicTrack);
    const track = ytEphemeralTrack(playable, ytMusicTrackToDto(musicTrack));

    const dto = ytDownloadDto(track, playable);

    expect(dto.artistIds).toEqual(["yt:UCTLkOu1J8aNJhEiWFWbMnVQ"]);
    expect(dto.albumId).toBe("yt:MPREb_1");
    expect(dto.albumTitle).toBe("Я взлетаю вверх");
    expect(dto.coverRef).toContain("googleusercontent");
  });

  it("falls back to the playable when no catalog DTO is attached", () => {
    const playable = playableFromMusicTrack(musicTrack);
    const track = ytEphemeralTrack(playable);

    const dto = ytDownloadDto(track, playable);

    expect(dto.id).toBe("yt:AP0gmnh_RFQ");
    expect(dto.artistIds).toBeUndefined();
    expect(dto.albumId).toBeUndefined();
  });
});
