import type { SidebarFolderEntity, SidebarFolderEntryEntity } from "@/db/entities";
import { folderRepository } from "@/db/repositories";
import { queryKeys } from "@/queries/query-keys";
import { SidebarFolderId } from "@/types/ids";
import type { QueryClient } from "@tanstack/vue-query";
import { queryOptions } from "@tanstack/vue-query";
import { unwrapResult } from "./shared";

export async function getFolders() {
  return unwrapResult(folderRepository.findAll());
}

export const folderQueries = {
  all: () =>
    queryOptions({
      queryKey: queryKeys.folders.all(),
      queryFn: getFolders,
    }),
} as const;

async function invalidateFolders(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.folders.all() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.library.summary() }),
  ]);
}

export async function createFolderAndSync(queryClient: QueryClient, name: string) {
  const now = Date.now();
  const folder: SidebarFolderEntity = {
    id: SidebarFolderId(crypto.randomUUID()),
    name: name.trim(),
    items: [],
    addedAt: now,
    updatedAt: now,
  };

  await unwrapResult(folderRepository.create(folder));
  queryClient.setQueryData(queryKeys.folders.all(), (folders: SidebarFolderEntity[] | undefined) => [
    ...(folders ?? []),
    folder,
  ]);
  await invalidateFolders(queryClient);

  return folder;
}

export async function renameFolderAndSync(queryClient: QueryClient, folderId: SidebarFolderId, name: string) {
  await unwrapResult(folderRepository.update(folderId, {
    name: name.trim(),
    updatedAt: Date.now(),
  }));
  await invalidateFolders(queryClient);
}

export async function deleteFolderAndSync(queryClient: QueryClient, folderId: SidebarFolderId) {
  await unwrapResult(folderRepository.delete(folderId));
  await invalidateFolders(queryClient);
}

export async function setFolderItemsAndSync(
  queryClient: QueryClient,
  folderId: SidebarFolderId,
  items: SidebarFolderEntryEntity[],
) {
  await unwrapResult(folderRepository.setItems(folderId, items));
  await invalidateFolders(queryClient);
}

export async function removeFolderItemAndSync(
  queryClient: QueryClient,
  type: SidebarFolderEntryEntity["type"],
  id: string,
) {
  await unwrapResult(folderRepository.removeItem(type, id));
  await invalidateFolders(queryClient);
}
