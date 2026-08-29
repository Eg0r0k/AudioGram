import { createTestingPinia } from "@pinia/testing";
import { fireEvent, render } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { i18n } from "@/app/i18n";
import type { SidebarFolderEntity } from "@/db/entities";
import type { LibraryItem } from "@/modules/library/types";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import FolderAddPanel from "../FolderAddPanel.vue";

const setFolderItems = vi.fn().mockResolvedValue(undefined);
const folders = ref<SidebarFolderEntity[]>([]);
const movableItems = ref<LibraryItem[]>([]);

vi.mock("@/modules/library/composables/useLibrary", () => ({
  useLibrary: () => ({
    folders: computed(() => folders.value),
    movableItems: computed(() => movableItems.value),
    setFolderItems,
  }),
}));

vi.mock("vue-sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

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
  RightPanelHeader: {
    props: ["title"],
    emits: ["back"],
    template: `<h2 data-testid="title" @click="$emit('back')">{{ title }}</h2>`,
  },
  VirtualScrollable: VirtualScrollableStub,
  EntityCoverImage: true,
  AddFloatingButton: {
    props: ["count", "show"],
    emits: ["click"],
    template: `<button v-if="show" data-testid="fab" @click="$emit('click')">{{ count }}</button>`,
  },
};

const folder = (id: string, name: string, items: SidebarFolderEntity["items"] = []) =>
  ({ id, name, items, addedAt: 1, updatedAt: 1 } as unknown as SidebarFolderEntity);

const libraryItem = (id: string, type: "artist" | "album" | "playlist", title: string, extra: Partial<LibraryItem> = {}) =>
  ({ id, type, title, isPinned: false, addedAt: 1, to: "/", rounded: type === "artist", ...extra } as LibraryItem);

const renderPanel = (folderId = "f1") => {
  const pinia = createTestingPinia({ stubActions: false });
  const rightPanel = useRightPanelStore(pinia);
  rightPanel.openFolderAdd({ folderId });
  const utils = render(FolderAddPanel, {
    props: { payload: { folderId } },
    global: { plugins: [i18n, pinia], stubs, directives: { ripple: {} } },
  });
  return { ...utils, rightPanel };
};

const rows = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-item-key]"));
const keys = (container: HTMLElement) => rows(container).map(r => r.getAttribute("data-item-key"));

describe("FolderAddPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    folders.value = [
      folder("f1", "Rock", [{ type: "playlist", id: "p-in" }]),
      folder("f2", "Grunge", [{ type: "album", id: "al1" }]),
    ];
    movableItems.value = [
      libraryItem("a1", "artist", "Zebra"),
      libraryItem("al1", "album", "Nevermind", { subtitle: "Nirvana" }),
      libraryItem("p1", "playlist", "Chill"),
      libraryItem("p-in", "playlist", "Already here"),
    ];
  });

  it("titles the panel with the folder name and lists candidates not already in the folder", () => {
    const { container, getByTestId } = renderPanel();
    expect(getByTestId("title").textContent).toContain("Rock");
    expect(keys(container)).toEqual(["playlist:p1", "album:al1", "artist:a1"]);
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
    expect(keys(container)).toEqual(["album:al1"]);
  });

  it("filters rows by search", async () => {
    const { container } = renderPanel();
    await fireEvent.update(container.querySelector("input")!, "chi");
    expect(keys(container)).toEqual(["playlist:p1"]);
  });

  it("confirm appends the selected entries to the folder and closes the panel", async () => {
    const { container, queryByTestId, getByTestId, rightPanel } = renderPanel();
    expect(queryByTestId("fab")).toBeNull();
    const [playlist, album] = rows(container);
    await fireEvent.click(playlist);
    await fireEvent.click(album);
    expect(getByTestId("fab").textContent).toBe("2");

    await fireEvent.click(getByTestId("fab"));
    await Promise.resolve();

    expect(setFolderItems).toHaveBeenCalledWith("f1", [
      { type: "playlist", id: "p-in" },
      { type: "playlist", id: "p1" },
      { type: "album", id: "al1" },
    ]);
    expect(rightPanel.isOpen).toBe(false);
  });

  it("shows an error toast and keeps the panel open when saving fails", async () => {
    setFolderItems.mockRejectedValueOnce(new Error("boom"));
    const { container, getByTestId, rightPanel } = renderPanel();
    const [playlist] = rows(container);
    await fireEvent.click(playlist);
    expect(getByTestId("fab").textContent).toBe("1");

    await fireEvent.click(getByTestId("fab"));
    await Promise.resolve();
    await Promise.resolve();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(rightPanel.isOpen).toBe(true);
    expect(rightPanel.view).toBe("folder-add");
    expect(getByTestId("fab").textContent).toBe("1");
  });

  it("clicking a selected row deselects it", async () => {
    const { container, queryByTestId } = renderPanel();
    const [first] = rows(container);
    await fireEvent.click(first);
    await fireEvent.click(first);
    expect(queryByTestId("fab")).toBeNull();
  });

  it("switching the type chip drops selections that are no longer visible", async () => {
    const { container, getAllByRole, getByTestId } = renderPanel();
    const [playlist, album] = rows(container);
    await fireEvent.click(playlist);
    await fireEvent.click(album);
    expect(getByTestId("fab").textContent).toBe("2");

    const albumsLabel = i18n.global.t("library.filterAlbums").toLowerCase();
    const albumsTab = getAllByRole("tab").find(t => t.textContent?.includes("1") && t.textContent?.toLowerCase().includes(albumsLabel))!;
    await fireEvent.mouseDown(albumsTab, { button: 0 });
    expect(getByTestId("fab").textContent).toBe("1");
  });

  it("back goes back through the store without writing", async () => {
    const { container, getByTestId, rightPanel } = renderPanel();
    const [first] = rows(container);
    await fireEvent.click(first);

    await fireEvent.click(getByTestId("title"));

    expect(setFolderItems).not.toHaveBeenCalled();
    expect(rightPanel.back).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when there is nothing to add", () => {
    movableItems.value = [libraryItem("p-in", "playlist", "Already here")];
    const { container } = renderPanel();
    expect(container.textContent).toContain(i18n.global.t("library.folder.nothingToAdd"));
  });

  it("closes the panel when the folder disappears", async () => {
    const { rightPanel } = renderPanel();
    expect(rightPanel.isOpen).toBe(true);

    folders.value = folders.value.filter(f => f.id !== "f1");
    await Promise.resolve();
    await Promise.resolve();

    expect(rightPanel.isOpen).toBe(false);
  });
});
