import { describe, expect, it } from "vitest";
import { TrackSource, TrackState } from "@/db/entities";
import type { EphemeralTrack, Track } from "@/modules/player/types";
import { TrackId } from "@/types/ids";
import { ytTrackId } from "@/types/track-ref";
import {
  toTrackMenuSubject,
  trackMenuSubjectId,
  type TrackMenuSubject,
} from "../../components/menu/type";
import { useTrackMenu } from "../useTrackMenu";

const libraryTrack: Track = {
  kind: "library",
  id: TrackId("track-1"),
  title: "Song",
  artist: "Artist",
  artistIds: [],
  albumId: "album-1" as never,
  albumName: "Album",
  storagePath: "tracks/song.mp3",
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 100,
  isLiked: false,
};

const ephemeralTrack: EphemeralTrack = {
  kind: "ephemeral",
  id: "eph-1",
  title: "Stream",
  source: { type: "url", url: "stream://localhost/yt/abc" },
};

const remoteSubject: TrackMenuSubject = {
  kind: "remote",
  dto: { id: ytTrackId("abc"), title: "Remote song" },
};

describe("toTrackMenuSubject", () => {
  it("wraps player tracks by their kind", () => {
    expect(toTrackMenuSubject(libraryTrack)).toEqual({ kind: "library", track: libraryTrack });
    expect(toTrackMenuSubject(ephemeralTrack)).toEqual({ kind: "ephemeral", track: ephemeralTrack });
  });
});

describe("trackMenuSubjectId", () => {
  it("resolves the payload id for every subject kind", () => {
    expect(trackMenuSubjectId({ kind: "library", track: libraryTrack })).toBe("track-1");
    expect(trackMenuSubjectId({ kind: "ephemeral", track: ephemeralTrack })).toBe("eph-1");
    expect(trackMenuSubjectId(remoteSubject)).toBe("yt:abc");
    expect(trackMenuSubjectId(null)).toBeNull();
  });
});

describe("useTrackMenu subject adapter", () => {
  it("keeps existing PlayerTrack call sites working and mirrors activeTrack", () => {
    const menu = useTrackMenu();

    menu.openMenu(libraryTrack, 0);

    expect(menu.activeSubject.value).toEqual({ kind: "library", track: libraryTrack });
    expect(menu.activeTrack.value).toEqual(libraryTrack);
    expect(menu.isContextMenuOpen.value).toBe(true);
  });

  it("accepts a remote subject and mirrors it as a display VM", () => {
    const menu = useTrackMenu();

    menu.openMenu(remoteSubject, 3, { target: "search" });

    expect(menu.activeSubject.value).toEqual(remoteSubject);
    expect(menu.activeTrack.value).toMatchObject({
      kind: "library",
      id: "yt:abc",
      title: "Remote song",
      sourceDto: remoteSubject.dto,
    });
    expect(menu.activeContextMenuTarget.value).toBe("search");
  });

  it("re-opens a display VM as a remote subject (round-trip)", () => {
    const menu = useTrackMenu();
    menu.openMenu(remoteSubject, 0);
    const displayTrack = menu.activeTrack.value!;

    menu.openMenu(displayTrack, 1);

    expect(menu.activeSubject.value).toEqual(remoteSubject);
  });

  it("accepts ephemeral tracks through the adapter", () => {
    const menu = useTrackMenu();

    menu.openMenu(ephemeralTrack, 1);

    expect(menu.activeSubject.value).toEqual({ kind: "ephemeral", track: ephemeralTrack });
    expect(menu.activeTrack.value).toEqual(ephemeralTrack);
  });
});
