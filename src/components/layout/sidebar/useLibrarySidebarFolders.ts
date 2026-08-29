import { computed, onScopeDispose, ref, watch, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import type { SidebarFolderEntity } from "@/db/entities";
import { normalizeFolderName, validateFolderName } from "@/modules/library/lib/folderName";
import type { FolderLibraryItemType, LibraryFolderEntry, LibraryItem } from "@/modules/library/types";

interface UseLibrarySidebarFoldersOptions {
  folders: ComputedRef<SidebarFolderEntity[]>;
  createFolder: (name?: string) => Promise<SidebarFolderEntity>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  setFolderItems: (folderId: string, items: LibraryFolderEntry[]) => Promise<void>;
}

function canMoveToFolder(item: LibraryItem): item is LibraryItem & { type: FolderLibraryItemType } {
  return item.type === "artist" || item.type === "album" || item.type === "playlist";
}

export function useLibrarySidebarFolders({
  folders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderItems,
}: UseLibrarySidebarFoldersOptions) {
  const { t } = useI18n();

  const activeFolderId = ref<string | null>(null);
  const isFolderNameDialogOpen = ref(false);
  /** What the name dialog opens with; the dialog owns the edited value. */
  const folderName = ref("");
  const editingFolderId = ref<string | null>(null);

  const rightPanel = useRightPanelStore();

  // The folder picker lives in the right panel, scoped to the folder it was
  // opened for: leaving that folder (or unmounting the sidebar) closes it.
  // `sync`: a pre-flush watcher would collapse `null → id → null` within one
  // tick into "no change" and never fire. Not reachable from separate user
  // gestures today, so this is defensive ordering, not a correctness need —
  // but do not drop it blind.
  watch(activeFolderId, id => rightPanel.invalidateFolderScope(id), { flush: "sync" });
  onScopeDispose(() => rightPanel.invalidateFolderScope(null));

  const activeFolder = computed(() =>
    folders.value.find((folder: SidebarFolderEntity) => folder.id === activeFolderId.value) ?? null,
  );

  const folderNameDialogTitle = computed(() => editingFolderId.value
    ? t("library.folder.rename")
    : t("library.folder.create"),
  );

  const folderDepth = computed<0 | 1>(() => (activeFolder.value ? 1 : 0));

  function openFolder(folderId: string) {
    activeFolderId.value = folderId;
  }

  const closeFolder = () => {
    activeFolderId.value = null;
  };

  function openCreateFolderDialog() {
    editingFolderId.value = null;
    folderName.value = t("library.folder.newFolder");
    isFolderNameDialogOpen.value = true;
  }

  function openRenameFolderDialog(folderId: string) {
    const folder = folders.value.find((folder: SidebarFolderEntity) => folder.id === folderId);
    if (!folder) return;

    editingFolderId.value = folderId;
    folderName.value = folder.name;
    isFolderNameDialogOpen.value = true;
  }

  /** `rawName` comes from the dialog already validated; the guard backs it up. */
  async function submitFolderName(rawName: string) {
    if (validateFolderName(rawName)) return;
    const name = normalizeFolderName(rawName);

    if (editingFolderId.value) {
      await renameFolder(editingFolderId.value, name);
    }
    else {
      await createFolder(name);
    }

    isFolderNameDialogOpen.value = false;
  }

  /**
   * Inline rename from the folder header. The field itself refuses an
   * invalid name (red border, no commit); this guard only backs it up.
   */
  async function renameActiveFolder(rawName: string) {
    if (!activeFolder.value || validateFolderName(rawName)) return;
    await renameFolder(activeFolder.value.id, normalizeFolderName(rawName));
  }

  /**
   * Enters the folder and opens the right-panel picker for it. Called from
   * the FAB inside a folder and from «add to folder» in the root context
   * menu, so the sidebar always shows the folder the picker writes to.
   */
  const openFolderPicker = (folderId: string) => {
    const folder = folders.value.find((folder: SidebarFolderEntity) => folder.id === folderId);
    if (!folder) return;

    activeFolderId.value = folderId;
    rightPanel.openFolderAdd({ folderId });
  };

  async function deleteSidebarFolder(folderId: string) {
    await deleteFolder(folderId);
    if (activeFolderId.value === folderId) closeFolder();
  }

  async function removeItemFromActiveFolder(item: LibraryItem) {
    if (!activeFolder.value || !canMoveToFolder(item)) return;

    await setFolderItems(
      activeFolder.value.id,
      activeFolder.value.items.filter(entry => !(entry.type === item.type && entry.id === item.id)),
    );
  }

  return {
    activeFolder,
    closeFolder,
    deleteSidebarFolder,
    folderDepth,
    folderName,
    folderNameDialogTitle,
    isFolderNameDialogOpen,
    openCreateFolderDialog,
    openFolder,
    openFolderPicker,
    openRenameFolderDialog,
    removeItemFromActiveFolder,
    renameActiveFolder,
    submitFolderName,
  };
}
