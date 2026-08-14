import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { PlayerTrack, Track } from "@/modules/player/types";
import { usePlayerStore } from "@/modules/player/store/player.store";
import CurrentTrackPanel from "../CurrentTrackPanel.vue";

const importCurrentMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/tracks/composables/useEphemeralImport", async () => {
  const { computed, ref, toValue } = await import("vue");
  const { ephemeralFilePath } = await import("@/modules/tracks/lib/trackPredicates");
  return {
    useEphemeralImport: (track: unknown) => ({
      importPath: computed(() => ephemeralFilePath(toValue(track) as PlayerTrack | null)),
      isRunning: ref(false),
      importCurrent: importCurrentMock,
    }),
  };
});
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/modules/covers/composables/useEntityCover", async () => {
  const { ref } = await import("vue");
  return { useEntityCover: () => ({ url: ref<string | null>(null) }) };
});
vi.mock("@/composables/useMobilePlayerColor", async () => {
  const { ref } = await import("vue");
  return { useMobilePlayerColor: () => ({ color: ref({ hsl: "0 0% 0%" }) }) };
});
vi.mock("@/modules/tracks/composables/useTrackMenu", () => ({
  useTrackMenu: () => ({ openDropdown: vi.fn(), openMenu: vi.fn() }),
}));
vi.mock("@/modules/tracks/composables/useToggleTrackLike", () => ({
  useToggleTrackLike: () => ({ toggleTrackLike: vi.fn() }),
}));

const slotStub = { template: "<div><slot /></div>" };
const stubs = {
  Scrollable: slotStub,
  RightPanelHeader: true,
  NuxtImage: true,
  MarqueeBlock: slotStub,
  TrackRow: true,
  TrackContextMenu: slotStub,
  TrackDropdown: true,
  MorphingDialog: slotStub,
  MorphingDialogTrigger: slotStub,
  MorphingDialogContainer: slotStub,
  MorphingDialogContent: slotStub,
  MorphingDialogClose: slotStub,
};

function renderPanel(track: PlayerTrack | null) {
  setActivePinia(createPinia());
  const playerStore = usePlayerStore();
  playerStore.currentTrack = track;
  return render(CurrentTrackPanel, {
    global: { plugins: [i18n], stubs },
  });
}

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

describe("CurrentTrackPanel import CTA", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    importCurrentMock.mockReset();
  });

  it("shows the import button for an open-with ephemeral track and runs the import", async () => {
    renderPanel({
      kind: "ephemeral",
      id: "eph-1",
      title: "Open-with file",
      source: { type: "path", path: "C:/Music/x.flac" },
    });

    const button = screen.getByRole("button", { name: "Import to library" });
    await userEvent.click(button);

    expect(importCurrentMock).toHaveBeenCalledTimes(1);
  });

  it("shows the like button instead for library tracks", () => {
    renderPanel(libraryTrack());

    expect(screen.queryByRole("button", { name: "Import to library" })).toBeNull();
  });
});
