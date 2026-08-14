import { describe, expect, it } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { ephemeralFilePath } from "../trackPredicates";

function libraryTrack(): Track {
  return {
    kind: "library",
    id: "t1" as Track["id"],
    title: "Library",
    artist: "Artist",
    artistIds: [],
    albumId: "a1" as Track["albumId"],
    albumName: "Album",
    storagePath: "tracks/t1.mp3",
    source: TrackSource.LOCAL_INTERNAL,
    state: TrackState.READY,
    duration: 100,
    isLiked: false,
  };
}

describe("ephemeralFilePath", () => {
  it("returns the absolute path of an open-with ephemeral track", () => {
    expect(ephemeralFilePath({
      kind: "ephemeral",
      id: "eph-1",
      title: "File",
      source: { type: "path", path: "C:/Music/track.flac" },
    })).toBe("C:/Music/track.flac");
  });

  it("returns null for a url-sourced ephemeral track", () => {
    expect(ephemeralFilePath({
      kind: "ephemeral",
      id: "eph-2",
      title: "Radio",
      source: { type: "url", url: "https://radio.example/stream" },
    })).toBeNull();
  });

  it("returns null for a library track and for null", () => {
    expect(ephemeralFilePath(libraryTrack())).toBeNull();
    expect(ephemeralFilePath(null)).toBeNull();
  });
});
