import { describe, expect, it } from "vitest";
import type { YtMusicTrack } from "../../types";
import { playableFromMusicTrack } from "../playable";

function track(artists: YtMusicTrack["artists"]): YtMusicTrack {
  return {
    id: "v1",
    title: "Track",
    artists,
    artistId: "UC123",
    album: null,
    duration: 120,
    thumbnail: null,
    isVideo: false,
    trackNr: null,
  } as unknown as YtMusicTrack;
}

describe("playableFromMusicTrack", () => {
  it("uses parsed artists when present, ignoring the fallback", () => {
    const playable = playableFromMusicTrack(track([{ id: "UC1", name: "Real" }]), null, "Channel");

    expect(playable.artist).toBe("Real");
    expect(playable.meta?.artists).toEqual(["Real"]);
  });

  it("falls back to the lazily resolved author when artists are empty", () => {
    const playable = playableFromMusicTrack(track([]), null, "Channel");

    expect(playable.artist).toBe("Channel");
    expect(playable.meta?.artists).toEqual(["Channel"]);
  });

  it("stays artist-less without a fallback", () => {
    const playable = playableFromMusicTrack(track([]));

    expect(playable.artist).toBeNull();
    expect(playable.meta?.artists).toEqual([]);
  });
});
