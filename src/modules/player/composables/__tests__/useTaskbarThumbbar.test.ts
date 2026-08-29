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

// Only the capability flag is faked: keeping IS_TAURI false leaves the rest
// of the app (storage, sources) on its browser code paths.
vi.mock("@/lib/environment/platformCaps", () => ({
  platformCaps: { hasTaskbarThumbbar: true },
}));

const invokeMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => false,
}));

type Listener = (event: { payload: string }) => void;
const listeners = vi.hoisted(() => new Map<string, Listener>());
vi.mock("@/composables/tauri/useTauriEvent", () => ({
  default: (name: string, callback: Listener) => {
    listeners.set(name, callback);
    return () => listeners.delete(name);
  },
}));

import { usePlayerStore } from "../../store/player.store";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import {
  THUMBBAR_ACTION_EVENT,
  THUMBBAR_SET_STATE_COMMAND,
  useTaskbarThumbbar,
  type ThumbbarState,
} from "../useTaskbarThumbbar";

const createLibraryTrack = (id: string): Track => ({
  kind: "library",
  id: id as Track["id"],
  title: `Track ${id}`,
  artist: "Artist",
  artistIds: [],
  albumId: "album" as Track["albumId"],
  albumName: "Album",
  storagePath: `tracks/${id}.mp3`,
  source: TrackSource.LOCAL_INTERNAL,
  state: TrackState.READY,
  duration: 200,
  isLiked: false,
});

const Host = defineComponent({
  setup() {
    useTaskbarThumbbar();
    return () => h("div");
  },
});

const mount = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  return render(Host, { global: { plugins: [pinia, i18n, VueQueryPlugin] } });
};

const lastState = (): ThumbbarState => {
  const call = invokeMock.mock.lastCall as unknown as [string, { state: ThumbbarState }];
  expect(call[0]).toBe(THUMBBAR_SET_STATE_COMMAND);
  return call[1].state;
};

const click = (action: string) => {
  listeners.get(THUMBBAR_ACTION_EVENT)!({ payload: action });
};

describe("useTaskbarThumbbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
  });

  it("pushes a fully disabled toolbar while nothing is loaded", () => {
    mount();

    const state = lastState();
    expect(state).toMatchObject({
      hasTrack: false,
      playing: false,
      liked: false,
      canLike: false,
      hasPrevious: false,
      hasNext: false,
    });
    expect(state.tooltips).toEqual({
      like: "Like",
      unlike: "Remove like",
      previous: "Previous",
      play: "Play",
      pause: "Pause",
      next: "Next",
    });
  });

  it("reports the loaded library track as likeable", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");

    await vi.waitFor(() => {
      expect(lastState()).toMatchObject({ hasTrack: true, canLike: true, liked: false });
    });
  });

  it("skips the native call when nothing relevant changed", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    await vi.waitFor(() => expect(lastState().hasTrack).toBe(true));

    const calls = invokeMock.mock.calls.length;
    player.currentTime = 42;
    player.volume = 0.3;
    await Promise.resolve();

    expect(invokeMock.mock.calls.length).toBe(calls);
  });

  it("keeps the pause icon through the loading gap of a track switch", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    player.playbackState = { kind: "playing" };
    await vi.waitFor(() => expect(lastState().playing).toBe(true));
    invokeMock.mockClear();

    // A skip passes through "loading" before the next track plays.
    player.playbackState = { kind: "loading", requestId: 0 };
    player.currentTrack = createLibraryTrack("t2");
    await Promise.resolve();
    player.playbackState = { kind: "playing" };
    await Promise.resolve();

    const pushedPlaying = invokeMock.mock.calls.map(
      call => (call as unknown as [string, { state: ThumbbarState }])[1].state.playing,
    );
    expect(pushedPlaying).not.toContain(false);

    player.playbackState = { kind: "paused" };
    await vi.waitFor(() => expect(lastState().playing).toBe(false));
  });

  it("toggles play/pause from the toolbar", async () => {
    mount();
    const player = usePlayerStore();
    const togglePlay = vi.spyOn(player, "togglePlay").mockResolvedValue();

    click("play-pause");

    expect(togglePlay).toHaveBeenCalledTimes(1);
  });

  it("moves through the queue only when a neighbour exists", async () => {
    mount();
    const queue = useQueueStore();
    const next = vi.spyOn(queue, "next").mockImplementation(() => {});
    const previous = vi.spyOn(queue, "previous").mockImplementation(() => {});

    click("next");
    click("previous");

    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
  });

  it("likes the current track and reports the filled heart back", async () => {
    toggleLikeMock.mockImplementation(async (_client: unknown, track: Track) => ({
      ...track,
      isLiked: !track.isLiked,
    }));
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");

    click("like");

    await vi.waitFor(() => {
      expect(lastState()).toMatchObject({ liked: true, canLike: true });
    });
  });
});
