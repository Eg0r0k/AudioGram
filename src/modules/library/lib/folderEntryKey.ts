import type { FolderLibraryItemType, LibraryFolderEntry, LibraryItem } from "../types";

//
// Folder entries travel through the selection UI as "<type>:<id>" keys.
// Building and parsing live together here because the id itself may carry
// colons — remote entities are prefixed ("album:nd:MPREb…").
//

export function libraryItemKey(item: Pick<LibraryItem, "type" | "id">): string {
  return `${item.type}:${item.id}`;
}

export function isFolderLibraryItemType(type: string): type is FolderLibraryItemType {
  return type === "artist" || type === "album" || type === "playlist";
}

/** Inverse of {@link libraryItemKey}; unknown types parse to []. */
export function parseFolderEntryKey(key: string): LibraryFolderEntry[] {
  // Only the FIRST colon separates type from id — remote ids keep their
  // own "nd:"/"yt:" prefix and must survive the round-trip intact.
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) return [];
  const type = key.slice(0, separatorIndex);
  const id = key.slice(separatorIndex + 1);
  if (!isFolderLibraryItemType(type) || !id) return [];
  return [{ type, id }];
}
