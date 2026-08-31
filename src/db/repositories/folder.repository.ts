import { db } from "@/db";
import type { SidebarFolderEntity, SidebarFolderEntryEntity } from "@/db/entities";
import type { SidebarFolderId } from "@/types/ids";
import type { Result } from "neverthrow";
import { err, ok } from "neverthrow";
import { BaseRepository } from "./base.repository";
import { toDbError } from "@/db/errors/db.errors";

function folderItemKey(item: SidebarFolderEntryEntity) {
  return `${item.type}:${item.id}`;
}

function normalizeFolderItems(items: SidebarFolderEntryEntity[]) {
  const seen = new Set<string>();
  const normalizedItems: SidebarFolderEntryEntity[] = [];

  for (const item of items) {
    const plainItem: SidebarFolderEntryEntity = {
      type: item.type,
      id: item.id,
    };
    const key = folderItemKey(plainItem);
    if (seen.has(key)) continue;

    seen.add(key);
    normalizedItems.push(plainItem);
  }

  return { normalizedItems, seen };
}

class FolderRepository extends BaseRepository<SidebarFolderEntity, SidebarFolderId> {
  constructor() {
    super(db.folders);
  }

  async setItems(folderId: SidebarFolderId, items: SidebarFolderEntryEntity[]): Promise<Result<void, Error>> {
    try {
      const { normalizedItems, seen } = normalizeFolderItems(items);

      await db.transaction("rw", db.folders, async () => {
        await this.table.update(folderId, {
          items: normalizedItems,
          updatedAt: Date.now(),
        });

        const folders = await this.table.toArray();
        await Promise.all(folders.map(async (folder) => {
          if (folder.id === folderId) return;

          const filteredItems = folder.items.filter(item => !seen.has(folderItemKey(item)));
          if (filteredItems.length === folder.items.length) return;

          await this.table.update(folder.id, {
            items: filteredItems,
            updatedAt: Date.now(),
          });
        }));
      });

      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }

  async removeItem(type: SidebarFolderEntryEntity["type"], id: string): Promise<Result<void, Error>> {
    try {
      await db.transaction("rw", db.folders, async () => {
        const folders = await this.table.toArray();
        await Promise.all(folders.map(async (folder) => {
          const filteredItems = folder.items.filter(item => !(item.type === type && item.id === id));
          if (filteredItems.length === folder.items.length) return;

          await this.table.update(folder.id, {
            items: filteredItems,
            updatedAt: Date.now(),
          });
        }));
      });

      return ok(undefined);
    }
    catch (error) {
      return err(toDbError(error));
    }
  }
}

export const folderRepository = new FolderRepository();
