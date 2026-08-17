import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import { TrackSource, TrackState } from "@/db/entities";
import type { Track } from "@/modules/player/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import { useTrackEditDraft } from "@/modules/tracks/composables/useTrackEditDraft";
import EditTrackPanel from "../EditTrackPanel.vue";

vi.mock("@/queries/track.queries", () => ({
  updateTrackMetadataAndSync: vi.fn(),
}));

const slotStub = { template: "<div><slot /></div>" };
const stubs = {
  Scrollable: slotStub,
  FloatingActionButton: slotStub,
  RightPanelHeader: {
    emits: ["back", "close"],
    template: `<div>
      <button type="button" data-testid="header-back" @click="$emit('back')"></button>
      <button type="button" data-testid="header-close" @click="$emit('close')"></button>
    </div>`,
  },
  UnsavedChangesDialog: {
    props: { open: Boolean },
    template: `<div v-if="open" data-testid="unsaved-dialog"></div>`,
  },
};

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

const renderPanel = (track: Track) => render(EditTrackPanel, {
  props: { payload: { track } },
  global: { plugins: [i18n, VueQueryPlugin], stubs },
});

describe("EditTrackPanel", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    useTrackEditDraft().clearDraft();
  });

  it("keeps the picked artists when the picker round-trip remounts the form", async () => {
    const track = libraryTrack();
    const first = renderPanel(track);
    const rightPanel = useRightPanelStore();

    await userEvent.click(screen.getByRole("button", { name: /Artists/ }));
    expect(rightPanel.view).toBe("entity-select");

    const payload = rightPanel.payload as RightPanelEntitySelectPayload;
    expect(payload.selectedNames).toEqual(["Artist"]);

    payload.onConfirm({ names: ["Alpha", "Beta"] });
    payload.onDone?.();
    expect(rightPanel.view).toBe("edit-track");

    first.unmount();
    renderPanel(track);

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("stores a created album as a pending title and shows the hint", async () => {
    const track = libraryTrack();
    const first = renderPanel(track);
    const rightPanel = useRightPanelStore();

    await userEvent.click(screen.getByRole("button", { name: /Album/ }));
    const payload = rightPanel.payload as RightPanelEntitySelectPayload;

    payload.onConfirm({ albumTitle: "Fresh Album" });
    payload.onDone?.();

    first.unmount();
    renderPanel(track);

    expect(screen.getByText("Fresh Album")).toBeInTheDocument();
    expect(screen.getByText("A new album will be created")).toBeInTheDocument();
  });

  it("guards back navigation while the form is dirty", async () => {
    const { container } = renderPanel(libraryTrack());
    const rightPanel = useRightPanelStore();

    const titleInput = container.querySelector("#track-title") as HTMLInputElement;
    await userEvent.type(titleInput, " remix");

    await userEvent.click(screen.getByTestId("header-back"));

    expect(screen.getByTestId("unsaved-dialog")).toBeInTheDocument();
    expect(rightPanel.view).not.toBe("track-info");
  });

  it("navigates straight back when nothing changed", async () => {
    renderPanel(libraryTrack());
    const rightPanel = useRightPanelStore();

    await userEvent.click(screen.getByTestId("header-back"));

    expect(screen.queryByTestId("unsaved-dialog")).toBeNull();
    expect(rightPanel.view).toBe("track-info");
  });
});
