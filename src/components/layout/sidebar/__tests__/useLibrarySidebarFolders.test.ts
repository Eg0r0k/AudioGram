import { createTestingPinia } from "@pinia/testing";
import { computed, defineComponent, h, nextTick } from "vue";
import { render } from "@testing-library/vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/app/i18n";
import type { SidebarFolderEntity } from "@/db/entities";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { activeSidebarFolderId, useLibrarySidebarFolders } from "../useLibrarySidebarFolders";

const folders: SidebarFolderEntity[] = [
  { id: "f1", name: "Rock", items: [{ type: "album", id: "al1" }], addedAt: 1, updatedAt: 1 } as unknown as SidebarFolderEntity,
  { id: "f2", name: "Jazz", items: [], addedAt: 1, updatedAt: 1 } as unknown as SidebarFolderEntity,
];

const setup = () => {
  const pinia = createTestingPinia({ stubActions: false });
  const rightPanel = useRightPanelStore(pinia);
  const deleteFolder = vi.fn().mockResolvedValue(undefined);
  let api!: ReturnType<typeof useLibrarySidebarFolders>;
  const Host = defineComponent({
    setup() {
      api = useLibrarySidebarFolders({
        folders: computed(() => folders),
        createFolder: vi.fn(),
        renameFolder: vi.fn(),
        deleteFolder,
        setFolderItems: vi.fn().mockResolvedValue(undefined),
      });
      return () => h("div");
    },
  });
  const { unmount } = render(Host, { global: { plugins: [i18n, pinia] } });
  return { api, rightPanel, deleteFolder, unmount };
};

describe("useLibrarySidebarFolders picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeSidebarFolderId.value = null;
  });

  it("openFolderPicker enters the folder and opens the right panel bound to it", () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("f1");
    expect(api.activeFolder.value?.id).toBe("f1");
    expect(api.folderDepth.value).toBe(1);
    expect(rightPanel.openFolderAdd).toHaveBeenCalledWith({ folderId: "f1" });
    expect(rightPanel.view).toBe("folder-add");
    expect(rightPanel.scope).toEqual({ type: "folder", folderId: "f1" });
  });

  it("openFolderPicker ignores an unknown folder", () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("nope");
    expect(api.activeFolder.value).toBeNull();
    expect(rightPanel.openFolderAdd).not.toHaveBeenCalled();
  });

  it("leaving the folder closes its panel", async () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("f1");
    api.closeFolder();
    await nextTick();
    expect(api.folderDepth.value).toBe(0);
    expect(rightPanel.isOpen).toBe(false);
  });

  it("opening another folder closes the panel of the previous one", async () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("f1");
    api.openFolder("f2");
    await nextTick();
    expect(rightPanel.isOpen).toBe(false);
  });

  it("switching straight to another folder's picker keeps the new panel open", async () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("f1");
    api.openFolderPicker("f2");
    await nextTick();
    expect(rightPanel.isOpen).toBe(true);
    expect(rightPanel.scope).toEqual({ type: "folder", folderId: "f2" });
  });

  it("deleting the active folder closes the panel", async () => {
    const { api, rightPanel } = setup();
    api.openFolderPicker("f1");
    await api.deleteSidebarFolder("f1");
    await nextTick();
    expect(api.activeFolder.value).toBeNull();
    expect(rightPanel.isOpen).toBe(false);
  });

  it("unmounting the sidebar closes a folder-scoped panel", () => {
    const { api, rightPanel, unmount } = setup();
    api.openFolderPicker("f1");
    unmount();
    expect(rightPanel.isOpen).toBe(false);
  });

  it("the open folder survives a remount of the sidebar", () => {
    // On a phone the sidebar is the home page: opening an artist from a
    // folder unmounts it, and back must land in that folder again.
    const first = setup();
    first.api.openFolder("f1");
    first.unmount();

    const second = setup();
    expect(second.api.activeFolder.value?.id).toBe("f1");
    expect(second.api.folderDepth.value).toBe(1);
  });
});
