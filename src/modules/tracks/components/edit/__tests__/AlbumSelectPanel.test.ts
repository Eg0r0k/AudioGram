import { fireEvent, render, screen } from "@testing-library/vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { AlbumEntity } from "@/db/entities";
import type { RightPanelEntitySelectPayload } from "@/modules/right-panel/types";
import { searchAlbums } from "@/queries/album.queries";
import AlbumSelectPanel from "../AlbumSelectPanel.vue";

vi.mock("@/queries/album.queries", () => ({
  searchAlbums: vi.fn(),
}));
vi.mock("@/components/ui/EntityCoverImage.vue", () => ({
  default: { template: "<span />" },
}));

const albums: AlbumEntity[] = [
  { id: "a1" as AlbumEntity["id"], title: "Attached", artistId: "ar" as AlbumEntity["artistId"], pinned: 1, addedAt: 1, updatedAt: 1 },
  { id: "a2" as AlbumEntity["id"], title: "Other", artistId: "ar" as AlbumEntity["artistId"], pinned: 1, addedAt: 1, updatedAt: 1 },
];

// Virtual scrolling needs a measured viewport; happy-dom has none.
const VirtualScrollableStub = {
  props: ["items"],
  template: `
    <div>
      <div v-for="(item, index) in items" :key="index">
        <slot :item="item" :index="index" />
      </div>
    </div>`,
};
const stubs = {
  RightPanelHeader: true,
  VirtualScrollable: VirtualScrollableStub,
  AddFloatingButton: {
    props: ["count", "show"],
    emits: ["click"],
    template: `<button v-if="show" data-testid="fab" @click="$emit('click')">{{ count }}</button>`,
  },
};

const renderPanel = (payload: Partial<RightPanelEntitySelectPayload> = {}) => {
  const onConfirm = vi.fn();
  const onDone = vi.fn();
  render(AlbumSelectPanel, {
    props: { payload: { kind: "album", selectedAlbumId: "a1", onConfirm, onDone, ...payload } },
    global: { plugins: [i18n, VueQueryPlugin], stubs },
  });
  return { onConfirm, onDone };
};

describe("AlbumSelectPanel", () => {
  beforeEach(() => {
    i18n.global.locale.value = "en";
    vi.mocked(searchAlbums).mockResolvedValue(albums);
  });

  it("does not offer a separate 'No album' row", async () => {
    renderPanel();
    await screen.findByText("Attached");

    expect(screen.queryByText("No album")).not.toBeInTheDocument();
  });

  it("opens with no pending change: the confirm button is hidden", async () => {
    renderPanel();
    await screen.findByText("Attached");

    expect(screen.queryByTestId("fab")).not.toBeInTheDocument();
  });

  it("clicking a row only changes the selection — nothing is confirmed until the button", async () => {
    const { onConfirm, onDone } = renderPanel();

    await fireEvent.click(await screen.findByText("Other"));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId("fab")).toBeInTheDocument();
  });

  it("confirms another album through the button", async () => {
    const { onConfirm, onDone } = renderPanel();

    await fireEvent.click(await screen.findByText("Other"));
    await fireEvent.click(screen.getByTestId("fab"));

    expect(onConfirm).toHaveBeenCalledWith({ albumId: "a2", albumTitle: "Other" });
    expect(onDone).toHaveBeenCalled();
  });

  it("clicking the attached album again deselects it; confirming detaches the track", async () => {
    const { onConfirm, onDone } = renderPanel();

    await fireEvent.click(await screen.findByText("Attached"));
    await fireEvent.click(screen.getByTestId("fab"));

    expect(onConfirm).toHaveBeenCalledWith({});
    expect(onDone).toHaveBeenCalled();
  });

  it("selecting the attached album back cancels the pending change", async () => {
    renderPanel();

    await fireEvent.click(await screen.findByText("Attached"));
    await fireEvent.click(screen.getByText("Attached"));

    expect(screen.queryByTestId("fab")).not.toBeInTheDocument();
  });
});
