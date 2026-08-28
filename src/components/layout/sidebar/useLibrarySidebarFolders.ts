import { computed, ref, type ComputedRef } from "vue";
import { useI18n } from "vue-i18n";
import { useSidebar } from "@/composables/useSidebar";
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
  const isFolderPickerOpen = ref(false);
  const { expandLeftSidebar } = useSidebar();
  const isMoveToFolderDialogOpen = ref(false);
  const itemToMove = ref<LibraryItem | null>(null);

  const activeFolder = computed(() =>
    folders.value.find((folder: SidebarFolderEntity) => folder.id === activeFolderId.value) ?? null,
  );

  const folderNameDialogTitle = computed(() => editingFolderId.value
    ? t("library.folder.rename")
    : t("library.folder.create"),
  );

  const folderDepth = computed<0 | 1 | 2>(() => {
    if (!activeFolder.value) return 0;
    return isFolderPickerOpen.value ? 2 : 1;
  });

  function openFolder(folderId: string) {
    activeFolderId.value = folderId;
  }

  const closeFolder = () => {
    isFolderPickerOpen.value = false;
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
   * The picker lives inside the sidebar, so in the icon-only compact layout
   * it would not fit: opening it expands the sidebar and leaves it expanded.
   */
  const openFolderPicker = (folderId: string) => {
    const folder = folders.value.find((folder: SidebarFolderEntity) => folder.id === folderId);
    if (!folder) return;

    activeFolderId.value = folderId;
    isFolderPickerOpen.value = true;
    expandLeftSidebar();
  };

  const closeFolderPicker = () => {
    isFolderPickerOpen.value = false;
  };

  /** Appending is enough: the repository strips the entries from other folders. */
  const addItemsToActiveFolder = async (entries: LibraryFolderEntry[]) => {
    if (!activeFolder.value) return;

    await setFolderItems(activeFolder.value.id, [...activeFolder.value.items, ...entries]);
    isFolderPickerOpen.value = false;
  };

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
    addItemsToActiveFolder,
    closeFolder,
    closeFolderPicker,
    deleteSidebarFolder,
    folderDepth,
    folderName,
    folderNameDialogTitle,
    isFolderNameDialogOpen,
    isFolderPickerOpen,
    isMoveToFolderDialogOpen,
    itemToMove,
    moveItemToFolder,
    openCreateFolderDialog,
    openFolder,
    openFolderPicker,
    openMoveToFolderDialog,
    openRenameFolderDialog,
    removeItemFromActiveFolder,
    renameActiveFolder,
    submitFolderName,
  };
}
