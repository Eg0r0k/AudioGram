import { render } from "@testing-library/vue";
import { defineComponent, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "../../types";

vi.hoisted(() => {
  vi.stubEnv("VITE_DISCORD_CLIENT_ID", "client-1");
});

vi.mock("@/db/repositories", () => ({
  trackRepository: { findByIds: vi.fn() },
  offlineCopyRepository: { findById: vi.fn() },
}));

vi.mock("@/modules/recommendations/service/recommender.service", () => ({
  getRecommendations: vi.fn(() => Promise.resolve([])),
}));

vi.mock("@/lib/environment/platformCaps", () => ({
  platformCaps: { hasDiscord: true },
}));

const invokeMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
  isTauri: () => false,
}));

import { usePlayerStore } from "../../store/player.store";
import { useDiscordPresence } from "../useDiscordPresence";

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
    useDiscordPresence();
    return () => h("div");
  },
});

const mount = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  return render(Host, { global: { plugins: [pinia, i18n, VueQueryPlugin] } });
};

const activityCalls = () =>
  invokeMock.mock.calls.filter(([command]) => command === "discord_set_activity");

// The engine reports position ~4 times a second; simulate that cadence.
const TIMEUPDATE_STEP = 0.25;

const advance = async (player: ReturnType<typeof usePlayerStore>, from: number, to: number) => {
  for (let t = from + TIMEUPDATE_STEP; t <= to + 1e-9; t += TIMEUPDATE_STEP) {
    player.currentTime = Number(t.toFixed(2));
    await nextTick();
  }
};

describe("useDiscordPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pushes the activity once when playback starts", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    player.duration = 200;
    player.playbackState = { kind: "playing" };
    await nextTick();

    expect(activityCalls()).toHaveLength(1);
    expect(activityCalls()[0][1]).toMatchObject({
      payload: { clientId: "client-1", title: "Track t1", artist: "Artist", album: "Album" },
    });
  });

  it("stays silent across timeupdates inside one 15-second position bucket", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    player.duration = 200;
    player.playbackState = { kind: "playing" };
    await nextTick();
    invokeMock.mockClear();

    // 0.25 → 14.75: 59 position reports, all in bucket 0.
    await advance(player, 0, 14.75);

    expect(activityCalls()).toHaveLength(0);
  });

  it("re-pushes exactly once per bucket boundary", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    player.duration = 200;
    player.playbackState = { kind: "playing" };
    await nextTick();
    invokeMock.mockClear();

    // Crosses the 15 s and 30 s boundaries: two pushes over 120 reports.
    await advance(player, 0, 30);

    expect(activityCalls()).toHaveLength(2);
    expect(activityCalls()[0][1]).toMatchObject({ payload: { position: 15 } });
    expect(activityCalls()[1][1]).toMatchObject({ payload: { position: 30 } });
  });

  it("clears the activity on pause and pushes again on resume", async () => {
    mount();
    const player = usePlayerStore();
    player.currentTrack = createLibraryTrack("t1");
    player.duration = 200;
    player.playbackState = { kind: "playing" };
    await nextTick();
    invokeMock.mockClear();

    player.playbackState = { kind: "paused" };
    await nextTick();
    expect(invokeMock).toHaveBeenLastCalledWith("discord_clear_activity", undefined);

    player.playbackState = { kind: "playing" };
    await nextTick();
    expect(activityCalls()).toHaveLength(1);
  });
});
