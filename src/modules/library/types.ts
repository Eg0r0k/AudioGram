import type { RouteLocationRaw } from "vue-router";

export const LIBRARY_FILTERS = ["all", "playlist", "artist", "album"] as const;
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number];

export const SORT_OPTIONS = ["recent", "updated", "alphabetical", "author"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export type LibraryItemType = "artist" | "album" | "playlist" | "liked" | "allMedia" | "folder";
export type PinnableLibraryItemType = "artist" | "album" | "playlist";
export type FolderLibraryItemType = "artist" | "album" | "playlist";

export interface LibraryFolderEntry {
  type: FolderLibraryItemType;
  id: string;
}

export interface LibraryFolder {
  id: string;
  name: string;
  items: LibraryFolderEntry[];
  addedAt: number;
  updatedAt: number;
}

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  title: string;
  subtitle?: string;
  image?: string;
  isPinned: boolean;
  isSystem?: boolean;
  addedAt: number;
  updatedAt?: number;
  artistName?: string;
  to: RouteLocationRaw;
  rounded: boolean;
  trackCount?: number;
  folderItemCount?: number;
  /**
   * Live catalog row (ND browsing, albums on a catalog artist page): no Dexie
   * row behind it, so library actions (pin, folders, delete) have nothing to
   * write to. The menu switches to the catalog flavor instead.
   */
  isCatalog?: boolean;
}

export interface PinnedItem {
  type: PinnableLibraryItemType;
  id: string;
  pinnedAt: number;
}
