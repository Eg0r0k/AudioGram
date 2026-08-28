import type { SidebarFolderEntity } from "@/db/entities";
import type { FolderLibraryItemType, LibraryItem } from "../types";
import { isFolderLibraryItemType, libraryItemKey } from "./folderEntryKey";

export type FolderPickerItem = LibraryItem & { type: FolderLibraryItemType; folderName?: string };
export type FolderPickerFilter = FolderLibraryItemType | "all";

export const normalizePickerQuery = (query: string): string =>
  query.trim().replace(/\s+/g, " ").toLowerCase();

const isFolderable = (item: LibraryItem): item is LibraryItem & { type: FolderLibraryItemType } =>
  isFolderLibraryItemType(item.type);

/**
 * Candidates for adding to `targetFolderId`: every artist/album/playlist that
 * is not already inside that folder, annotated with the folder it currently
 * lives in (adding it moves it — the repository strips it from the old one).
 */
export const buildFolderPickerItems = (
  items: LibraryItem[],
  folders: SidebarFolderEntity[],
  targetFolderId: string,
): FolderPickerItem[] => {
  const folderNameByKey = new Map<string, string>();
  const targetKeys = new Set<string>();

  for (const folder of folders) {
    for (const entry of folder.items) {
      const key = libraryItemKey(entry);
      if (folder.id === targetFolderId) targetKeys.add(key);
      else folderNameByKey.set(key, folder.name);
    }
  }

  return items
    .filter(isFolderable)
    .filter(item => !targetKeys.has(libraryItemKey(item)))
    .map((item): FolderPickerItem => {
      const folderName = folderNameByKey.get(libraryItemKey(item));
      return folderName ? { ...item, folderName } : item;
    })
    .sort((a, b) => a.title.localeCompare(b.title));
};

export const filterFolderPickerItems = (
  items: FolderPickerItem[],
  filter: FolderPickerFilter,
  query: string,
): FolderPickerItem[] => {
  const needle = normalizePickerQuery(query);
  return items.filter((item) => {
    if (filter !== "all" && item.type !== filter) return false;
    if (!needle) return true;
    return item.title.toLowerCase().includes(needle)
      || (item.subtitle?.toLowerCase().includes(needle) ?? false);
  });
};

export const countFolderPickerItemsByType = (
  items: FolderPickerItem[],
): Record<FolderLibraryItemType, number> => {
  const counts: Record<FolderLibraryItemType, number> = { artist: 0, album: 0, playlist: 0 };
  for (const item of items) counts[item.type] += 1;
  return counts;
};
