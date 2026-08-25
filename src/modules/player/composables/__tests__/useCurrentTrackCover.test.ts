import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { TrackSource, TrackState } from "@/db/entities";
import type { PlayerTrack, Track } from "@/modules/player/types";

const mockPlayerState = reactive({
  currentTrack: null as PlayerTrack | null,
});

const coverBlobUrl = ref<string | null>(null);
const useTrackCoverMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/player/store/player.store", () => ({
  usePlayerStore: () => mockPlayerState,
}));

vi.mock("@/modules/covers/composables/useTrackCover", () => ({
  useTrackCover: useTrackCoverMock,
}));

import { useCurrentTrackCover } from "../useCurrentTrackCover";

const libraryTrack = (): Track => ({
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
});

describe("useCurrentTrackCover", () => {
  beforeEach(() => {
    mockPlayerState.currentTrack = null;
    coverBlobUrl.value = null;
    useTrackCoverMock.mockReset();
    useTrackCoverMock.mockReturnValue({ url: coverBlobUrl });
  });

  it("falls back when nothing is playing", () => {
    const { track, libraryTrack: lib, coverUrl } = useCurrentTrackCover();
    expect(track.value).toBeNull();
    expect(lib.value).toBeNull();
    expect(coverUrl.value).toBe("/img/fallback.svg");
  });

  it("resolves a library track cover through useTrackCover", () => {
    mockPlayerState.currentTrack = libraryTrack();
    const { libraryTrack: lib, coverUrl } = useCurrentTrackCover();

    expect(lib.value?.id).toBe("t1");
    expect(coverUrl.value).toBe("/img/fallback.svg");

    coverBlobUrl.value = "blob:cover";
    expect(coverUrl.value).toBe("blob:cover");
  });

  it("uses the direct cover url of an ephemeral track", () => {
    mockPlayerState.currentTrack = {
      kind: "ephemeral",
      id: "eph-1",
      title: "Stream",
      cover: "https://img/thumb.jpg",
      source: { type: "url", url: "https://stream" },
    };
    coverBlobUrl.value = "blob:should-not-win";
    const { libraryTrack: lib, coverUrl } = useCurrentTrackCover();

    expect(lib.value).toBeNull();
    expect(coverUrl.value).toBe("https://img/thumb.jpg");
  });

  it("falls back for an ephemeral track without art", () => {
    mockPlayerState.currentTrack = {
      kind: "ephemeral",
      id: "eph-2",
      title: "File",
      source: { type: "path", path: "C:/Music/x.flac" },
    };
    const { coverUrl } = useCurrentTrackCover();
    expect(coverUrl.value).toBe("/img/fallback.svg");
  });
});
