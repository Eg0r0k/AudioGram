/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from "@testing-library/vue";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "../../types";

vi.mock("@/db/repositories", () => ({
  trackRepository: { findByIds: vi.fn() },
  offlineCopyRepository: { findById: vi.fn() },
}));

vi.mock("@/modules/recommendations/service/recommender.service", () => ({
  getRecommendations: vi.fn(() => Promise.resolve([])),
}));

const toggleLikeMock = vi.hoisted(() => vi.fn());
vi.mock("@/queries/track.queries", () => ({
  toggleTrackLikeAndSync: toggleLikeMock,
}));

const getCoverBlobMock = vi.hoisted(() => vi.fn());
vi.mock("@/queries/cover.queries", () => ({
  getCoverBlob: getCoverBlobMock,
}));

import { usePlayerStore } from "../../store/player.store";
import { useMediaSession } from "../useMediaSession";

const createLibraryTrack = (id: string, albumId: string): Track => ({
  kind: "library",
  id: id as Track["id"],
  title: `Track ${id}`,
  artist: "Artist",
  artistIds: [],
  albumId: albumId as Track["albumId"],
  albumName: "Album",
  storagePath: `tracks/${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 200,
  isLiked: false,
});

const bridge = {
  setMetadata: vi.fn(),
  setPlaybackState: vi.fn(),
  release: vi.fn(),
};

const dispatchAndroidAction = (detail: Record<string, unknown>) => {
  window.dispatchEvent(new CustomEvent("audiogram-media-action", { detail }));
};

const Host = defineComponent({
  setup() {
    useMediaSession();
    return () => h("div");
  },
});

const mountSession = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  return render(Host, { global: { plugins: [pinia, i18n, VueQueryPlugin] } });
};

describe("useMediaSession (android bridge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).AudiogramMediaSession = bridge;
    // jsdom has no Blob URL support; the cover pipeline needs a stub.
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
    getCoverBlobMock.mockResolvedValue(null);
  });

  it("never reports paused to the notification while a track switch is loading", async () => {
    mountSession();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1", "album-a");
    player.status = "playing";
    await vi.waitFor(() => expect(bridge.setPlaybackState.mock.lastCall?.[0]).toBe(true));
    bridge.setPlaybackState.mockClear();

    player.status = "loading";
    player.currentTrack = createLibraryTrack("t2", "album-a");
    await Promise.resolve();
    player.status = "playing";
    await vi.waitFor(() => expect(bridge.setPlaybackState).toHaveBeenCalled());

    const reported = bridge.setPlaybackState.mock.calls.map(call => call[0]);
    expect(reported).not.toContain(false);

    player.status = "paused";
    await vi.waitFor(() => expect(bridge.setPlaybackState.mock.lastCall?.[0]).toBe(false));
  });

  it("reports the seek target immediately instead of the stale store position", async () => {
    mountSession();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1", "album-a");
    // Stand in for a loaded engine: the bridge only forwards a seek when the
    // store says it can seek. The store's own seekTo no-ops without an engine.
    Object.defineProperty(player, "canSeek", { get: () => true, configurable: true });
    player.duration = 200;
    player.currentTime = 30;

    bridge.setPlaybackState.mockClear();
    dispatchAndroidAction({ action: "seekto", positionMs: 150_000 });

    // The store's currentTime only updates on the next engine timeupdate; the
    // bridge must be told the seek target, or the lock-screen scrubber snaps
    // back to the old position for a second.
    const [, positionMs] = bridge.setPlaybackState.mock.lastCall!;
    expect(positionMs).toBe(150_000);
  });

  it("cycles repeat mode from the notification and reports it back", async () => {
    mountSession();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1", "album-a");

    bridge.setPlaybackState.mockClear();
    dispatchAndroidAction({ action: "repeat" });

    expect(player.repeatMode).toBe("all");
    await vi.waitFor(() => {
      const call = bridge.setPlaybackState.mock.lastCall!;
      expect(call[6]).toBe("all");
    });
  });

  it("toggles the current library track's like from the notification", async () => {
    toggleLikeMock.mockImplementation(async (_client: unknown, track: Track) => ({
      ...track,
      isLiked: !track.isLiked,
    }));
    mountSession();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1", "album-a");

    dispatchAndroidAction({ action: "like" });

    await vi.waitFor(() => {
      expect(player.currentTrack?.kind === "library" && player.currentTrack.isLiked).toBe(true);
    });
    await vi.waitFor(() => {
      const call = bridge.setPlaybackState.mock.lastCall!;
      // liked / canLike flags reach the bridge so the heart icon can fill in.
      expect(call[7]).toBe(true);
      expect(call[8]).toBe(true);
    });
  });

  it("never pushes the previous album's artwork with a new track's metadata", async () => {
    let resolveCoverB!: (blob: Blob) => void;
    getCoverBlobMock.mockImplementation(async (_type: string, id: string) => {
      if (id === "album-a") return new Blob(["cover-a"]);
      return new Promise<Blob>((resolve) => {
        resolveCoverB = resolve;
      });
    });

    mountSession();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1", "album-a");

    // Album A's cover arrives and is pushed with real bytes.
    await vi.waitFor(() => {
      const call = bridge.setMetadata.mock.lastCall!;
      expect(call[0]).toBe("Track t1");
      expect(call[3]).not.toBe("");
    });

    // Switch to a track from album B whose cover is still loading: the
    // metadata push must carry NO artwork rather than album A's stale bytes.
    bridge.setMetadata.mockClear();
    player.currentTrack = createLibraryTrack("t2", "album-b");

    await vi.waitFor(() => {
      expect(bridge.setMetadata).toHaveBeenCalled();
    });
    for (const call of bridge.setMetadata.mock.calls) {
      expect(call[0]).toBe("Track t2");
      expect(call[3]).toBe("");
    }

    // Once album B's cover lands, it is pushed for the current track.
    resolveCoverB(new Blob(["cover-b"]));
    await vi.waitFor(() => {
      const call = bridge.setMetadata.mock.lastCall!;
      expect(call[0]).toBe("Track t2");
      expect(call[3]).not.toBe("");
    });
  });
});
