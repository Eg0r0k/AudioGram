import { computed, defineComponent, h } from "vue";
import { render } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { SidebarFolderEntity } from "@/db/entities";
import { useLibrarySidebarFolders } from "../useLibrarySidebarFolders";

const expandLeftSidebar = vi.fn();
vi.mock("@/composables/useSidebar", () => ({
  useSidebar: () => ({ expandLeftSidebar }),
}));

const folders: SidebarFolderEntity[] = [
  { id: "f1", name: "Rock", items: [{ type: "album", id: "al1" }], addedAt: 1, updatedAt: 1 } as unknown as SidebarFolderEntity,
];

const setup = () => {
  const setFolderItems = vi.fn().mockResolvedValue(undefined);
  let api!: ReturnType<typeof useLibrarySidebarFolders>;
  const Host = defineComponent({
    setup() {
      api = useLibrarySidebarFolders({
        folders: computed(() => folders),
        createFolder: vi.fn(),
        renameFolder: vi.fn(),
        deleteFolder: vi.fn(),
        setFolderItems,
      });
      return () => h("div");
    },
  });
  render(Host, { global: { plugins: [i18n] } });
  return { api, setFolderItems };
};

describe("useLibrarySidebarFolders picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("openFolderPicker opens the folder, the picker and expands the sidebar", () => {
    const { api } = setup();
    api.openFolderPicker("f1");
    expect(api.activeFolder.value?.id).toBe("f1");
    expect(api.isFolderPickerOpen.value).toBe(true);
    expect(api.folderDepth.value).toBe(2);
    expect(expandLeftSidebar).toHaveBeenCalledTimes(1);
  });

  it("openFolderPicker ignores an unknown folder", () => {
    const { api } = setup();
    api.openFolderPicker("nope");
    expect(api.isFolderPickerOpen.value).toBe(false);
    expect(expandLeftSidebar).not.toHaveBeenCalled();
  });

  it("addItemsToActiveFolder appends entries and closes the picker", async () => {
    const { api, setFolderItems } = setup();
    api.openFolderPicker("f1");
    await api.addItemsToActiveFolder([{ type: "artist", id: "a1" }]);
    expect(setFolderItems).toHaveBeenCalledWith("f1", [
      { type: "album", id: "al1" },
      { type: "artist", id: "a1" },
    ]);
    expect(api.isFolderPickerOpen.value).toBe(false);
    expect(api.folderDepth.value).toBe(1);
  });

  it("closeFolder also closes the picker", () => {
    const { api } = setup();
    api.openFolderPicker("f1");
    api.closeFolder();
    expect(api.isFolderPickerOpen.value).toBe(false);
    expect(api.folderDepth.value).toBe(0);
  });
});
