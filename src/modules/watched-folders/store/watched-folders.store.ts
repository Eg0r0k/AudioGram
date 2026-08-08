import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { WatchedFolder, WatchedFolderStatus } from "../types";
import { normalizePath } from "@/lib/files/filterFiles";

export const useWatchedFoldersStore = defineStore("watched-folders", () => {
  const folders = ref<WatchedFolder[]>([]);
  const autoScanOnStartup = ref(true);

  const folderPaths = computed(() => new Set(folders.value.map(f => f.path)));

  function getNestedFolderPaths(folderPath: string): string[] {
    const normalized = normalizePath(folderPath);
    return folders.value
      .filter((f) => {
        const fp = normalizePath(f.path);
        return fp !== normalized && fp.startsWith(normalized + "/");
      })
      .map(f => f.path);
  }

  function addFolder(path: string): { ok: boolean; error?: string } {
    const normalized = normalizePath(path);

    if (folderPaths.value.has(normalized)) {
      return { ok: false, error: "Folder already added" };
    }

    const name = normalized.split("/").pop() ?? normalized;

    folders.value.push({
      id: crypto.randomUUID(),
      path: normalized,
      name,
      addedAt: Date.now(),
      lastScanAt: null,
      fileCount: 0,
      status: "idle",
    });

    return { ok: true };
  }

  function updateFolderPath(id: string, newPath: string) {
    const folder = folders.value.find(f => f.id === id);
    if (!folder) return;

    const normalized = normalizePath(newPath);
    folder.path = normalized;
    folder.name = normalized.split("/").pop() ?? normalized;
    folder.status = "idle";
    folder.errorMessage = undefined;
  }

  function removeFolder(id: string) {
    folders.value = folders.value.filter(f => f.id !== id);
  }

  function updateFolderStatus(
    id: string,
    status: WatchedFolderStatus,
    extra?: { fileCount?: number; lastScanAt?: number; errorMessage?: string },
  ) {
    const folder = folders.value.find(f => f.id === id);
    if (!folder) return;

    folder.status = status;
    if (extra?.fileCount !== undefined) folder.fileCount = extra.fileCount;
    if (extra?.lastScanAt !== undefined) folder.lastScanAt = extra.lastScanAt;
    if (extra?.errorMessage !== undefined) folder.errorMessage = extra.errorMessage;
    else if (status !== "error") folder.errorMessage = undefined;
  }

  function getFolder(id: string): WatchedFolder | undefined {
    return folders.value.find(f => f.id === id);
  }

  return {
    folders,
    autoScanOnStartup,
    folderPaths,
    addFolder,
    removeFolder,
    updateFolderStatus,
    getFolder,
    getNestedFolderPaths,
    normalizePath,
    updateFolderPath,
  };
}, {
  persist: {
    key: "audiogram-watched-folders",
    pick: ["folders", "autoScanOnStartup"],
  },
});
