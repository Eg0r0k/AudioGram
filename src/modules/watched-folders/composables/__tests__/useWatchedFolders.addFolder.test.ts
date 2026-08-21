import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { toast } from "vue-sonner";
import type { WatchedFolder } from "../../types";

const pickerMock = vi.hoisted(() => ({
  isAndroidFolderPickerAvailable: vi.fn(() => true),
  pickAndroidFolderTreeUri: vi.fn<() => Promise<string | null>>(),
}));

const storeMock = vi.hoisted(() => {
  const folders: WatchedFolder[] = [];
  return {
    folders,
    addFolder: vi.fn((path: string) => {
      folders.push({
        id: `f${folders.length + 1}`,
        path,
        name: path.split("/").pop() ?? path,
        status: "idle",
      } as WatchedFolder);
      return { ok: true };
    }),
    updateFolderStatus: vi.fn(),
    getNestedFolderPaths: vi.fn(() => []),
    getFolder: vi.fn(),
  };
});

vi.mock("@/lib/environment/userAgent", () => ({ IS_MOBILE: true }));
vi.mock("@/lib/android/folderPicker", async (importOriginal) => ({
  // treeUriToPath stays real — the flow test exercises the actual conversion.
  ...(await importOriginal<typeof import("@/lib/android/folderPicker")>()),
  isAndroidFolderPickerAvailable: pickerMock.isAndroidFolderPickerAvailable,
  pickAndroidFolderTreeUri: pickerMock.pickAndroidFolderTreeUri,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => false),
  stat: vi.fn(),
}));
vi.mock("vue-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key }),
}));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({}) }));
vi.mock("@/queries/library.queries", () => ({ invalidateLibraryData: vi.fn() }));
vi.mock("@/services/importer.service", () => ({
  musicLibraryEngine: { syncFolder: vi.fn(async () => ({ added: 0, removed: 0 })) },
}));
vi.mock("@/services/library-gc", () => ({ cleanupAfterTrackRemoval: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/unit-of-work", () => ({ unitOfWork: {} }));
vi.mock("@/modules/watched-folders/services/folder-watcher", () => ({
  startWatching: vi.fn(),
}));
vi.mock("@/modules/watched-folders/store/watched-folders.store", () => ({
  useWatchedFoldersStore: () => storeMock,
}));
vi.mock("pinia", () => ({
  storeToRefs: () => ({ folders: ref([]), autoScanOnStartup: ref(false) }),
}));

import { useWatchedFolders } from "../useWatchedFolders";

const TREE = "content://com.android.externalstorage.documents/tree/";

describe("useWatchedFolders.addFolder on Android", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMock.folders.length = 0;
    pickerMock.isAndroidFolderPickerAvailable.mockReturnValue(true);
  });

  it("adds the picked folder converted from the SAF tree uri", async () => {
    pickerMock.pickAndroidFolderTreeUri.mockResolvedValue(`${TREE}primary%3ADownload%2FAlbums`);

    await useWatchedFolders().addFolder();

    expect(storeMock.addFolder).toHaveBeenCalledWith("/storage/emulated/0/Download/Albums");
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("watchedFolders.folderAdded"));
  });

  it("does nothing when the user cancels the picker", async () => {
    pickerMock.pickAndroidFolderTreeUri.mockResolvedValue(null);

    await useWatchedFolders().addFolder();

    expect(storeMock.addFolder).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("rejects non-primary volumes with a toast and adds nothing", async () => {
    pickerMock.pickAndroidFolderTreeUri.mockResolvedValue(`${TREE}1D04-2A08%3AMusic`);

    await useWatchedFolders().addFolder();

    expect(storeMock.addFolder).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("watchedFolders.unsupportedVolume");
  });

  it("falls back to the public Music folder when the bridge is unavailable", async () => {
    pickerMock.isAndroidFolderPickerAvailable.mockReturnValue(false);

    await useWatchedFolders().addFolder();

    expect(pickerMock.pickAndroidFolderTreeUri).not.toHaveBeenCalled();
    expect(storeMock.addFolder).toHaveBeenCalledWith("/storage/emulated/0/Music");
  });
});
