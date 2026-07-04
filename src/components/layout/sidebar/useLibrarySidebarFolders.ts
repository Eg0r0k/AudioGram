import { computed, ref, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import type { SidebarFolderEntity } from "@/db/entities";
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
  const folderName = ref("");
  const editingFolderId = ref<string | null>(null);
  const isManageFolderDialogOpen = ref(false);
  const managingFolderId = ref<string | null>(null);
  const selectedFolderItemKeys = ref<string[]>([]);
  const isMoveToFolderDialogOpen = ref(false);
  const itemToMove = ref<LibraryItem | null>(null);

  const activeFolder = computed(() =>
    folders.value.find((folder: SidebarFolderEntity) => folder.id === activeFolderId.value) ?? null,
  );

  const folderNameDialogTitle = computed(() => editingFolderId.value
    ? t("library.folder.rename")
    : t("library.folder.create"),
  );

  function openFolder(folderId: string) {
    activeFolderId.value = folderId;
  }

  function closeFolder() {
    activeFolderId.value = null;
  }

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

  async function submitFolderName() {
    const name = folderName.value.trim();
    if (!name) return;

    if (editingFolderId.value) {
      await renameFolder(editingFolderId.value, name);
    }
    else {
      await createFolder(name);
    }

    isFolderNameDialogOpen.value = false;
  }

  function openManageFolderDialog(folderId: string) {
    const folder = folders.value.find((folder: SidebarFolderEntity) => folder.id === folderId);
    if (!folder) return;

    managingFolderId.value = folderId;
    selectedFolderItemKeys.value = folder.items.map(item => `${item.type}:${item.id}`);
    isManageFolderDialogOpen.value = true;
  }

  async function submitManageFolder(items: LibraryFolderEntry[]) {
    if (!managingFolderId.value) return;

    await setFolderItems(managingFolderId.value, items);
    isManageFolderDialogOpen.value = false;
  }

  function openMoveToFolderDialog(item: LibraryItem) {
    itemToMove.value = item;
    isMoveToFolderDialogOpen.value = true;
  }

  async function moveItemToFolder(folderId: string) {
    if (!itemToMove.value || !canMoveToFolder(itemToMove.value)) return;

    const folder = folders.value.find((folder: SidebarFolderEntity) => folder.id === folderId);
    if (!folder) return;

    await setFolderItems(folderId, [
      ...folder.items,
      { type: itemToMove.value.type, id: itemToMove.value.id },
    ]);
    isMoveToFolderDialogOpen.value = false;
  }

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
    folderName,
    folderNameDialogTitle,
    isFolderNameDialogOpen,
    isManageFolderDialogOpen,
    isMoveToFolderDialogOpen,
    itemToMove,
    selectedFolderItemKeys,
    closeFolder,
    deleteSidebarFolder,
    moveItemToFolder,
    openCreateFolderDialog,
    openFolder,
    openManageFolderDialog,
    openMoveToFolderDialog,
    openRenameFolderDialog,
    removeItemFromActiveFolder,
    submitFolderName,
    submitManageFolder,
  };
}
