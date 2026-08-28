import { fireEvent, render } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import { i18n } from "@/app/i18n";
import type { SidebarFolderEntity } from "@/db/entities";
import type { FolderPickerItem } from "@/modules/library/lib/folderPicker";
import LibraryFolderAddPanel from "../LibraryFolderAddPanel.vue";

const VirtualScrollableStub = {
  props: ["items"],
  template: `
    <div>
      <template v-if="items.length">
        <div v-for="(item, index) in items" :key="index">
          <slot :item="item" :index="index" />
        </div>
      </template>
      <slot v-else name="empty" />
    </div>`,
};

const stubs = {
  RightPanelHeader: { props: ["title"], template: `<h2 data-testid="title">{{ title }}</h2>` },
  VirtualScrollable: VirtualScrollableStub,
  EntityCoverImage: true,
  AddFloatingButton: {
    props: ["count", "show"],
    emits: ["click"],
    template: `<button v-if="show" data-testid="fab" @click="$emit('click')">{{ count }}</button>`,
  },
};

const folder = { id: "f1", name: "Rock", items: [], addedAt: 1, updatedAt: 1 } as unknown as SidebarFolderEntity;

const pickerItem = (id: string, type: FolderPickerItem["type"], title: string, extra: Partial<FolderPickerItem> = {}): FolderPickerItem =>
  ({ id, type, title, isPinned: false, addedAt: 1, to: "/", rounded: type === "artist", ...extra });

const items: FolderPickerItem[] = [
  pickerItem("a1", "artist", "Zebra"),
  pickerItem("al1", "album", "Nevermind", { subtitle: "Nirvana", folderName: "Grunge" }),
  pickerItem("p1", "playlist", "Chill"),
];

const renderPanel = (overrides: Record<string, unknown> = {}) =>
  render(LibraryFolderAddPanel, {
    props: { folder, items, ...overrides },
    global: { plugins: [i18n], stubs, directives: { ripple: {} } },
  });

const rows = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-item-key]"));

describe("LibraryFolderAddPanel", () => {
  it("titles the panel with the folder name and renders every candidate", () => {
    const { container, getByTestId } = renderPanel();
    expect(getByTestId("title").textContent).toContain("Rock");
    expect(rows(container)).toHaveLength(3);
  });

  it("shows the other folder's name in the subtitle", () => {
    const { container } = renderPanel();
    const album = rows(container).find(r => r.getAttribute("data-item-key") === "album:al1")!;
    expect(album.textContent).toContain("Grunge");
    expect(album.textContent).not.toContain("Nirvana");
  });

  it("filters rows by type chip", async () => {
    const { container, getAllByRole } = renderPanel();
    const albumsLabel = i18n.global.t("library.filterAlbums").toLowerCase();
    const albumsTab = getAllByRole("tab").find(t => t.textContent?.includes("1") && t.textContent?.toLowerCase().includes(albumsLabel))!;
    await fireEvent.mouseDown(albumsTab, { button: 0 });
    expect(rows(container).map(r => r.getAttribute("data-item-key"))).toEqual(["album:al1"]);
  });

  it("filters rows by search", async () => {
    const { container } = renderPanel();
    await fireEvent.update(container.querySelector("input")!, "chi");
    expect(rows(container).map(r => r.getAttribute("data-item-key"))).toEqual(["playlist:p1"]);
  });

  it("selecting rows shows the FAB and confirm emits the entries", async () => {
    const { container, queryByTestId, getByTestId, emitted } = renderPanel();
    expect(queryByTestId("fab")).toBeNull();
    const [artist, album] = rows(container);
    await fireEvent.click(artist);
    await fireEvent.click(album);
    expect(getByTestId("fab").textContent).toBe("2");
    await fireEvent.click(getByTestId("fab"));
    expect(emitted("confirm")).toEqual([[[{ type: "artist", id: "a1" }, { type: "album", id: "al1" }]]]);
  });

  it("clicking a selected row deselects it", async () => {
    const { container, queryByTestId } = renderPanel();
    const [artist] = rows(container);
    await fireEvent.click(artist);
    await fireEvent.click(artist);
    expect(queryByTestId("fab")).toBeNull();
  });

  it("renders the empty state when there is nothing to add", () => {
    const { container } = renderPanel({ items: [] });
    expect(container.textContent).toContain(i18n.global.t("library.folder.nothingToAdd"));
  });
});
