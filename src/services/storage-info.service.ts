import { invoke } from "@tauri-apps/api/core";
import { db } from "@/db";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { resetSearchIndex } from "@/modules/search/searchIndex";
import { StorageInfo } from "@/modules/settings/schema/storage";

async function calculateFolderSize(folder: string): Promise<number> {
  if (IS_TAURI) {
    try {
      return await invoke<number>("app_data_folder_size", { folder });
    }
    catch {
      // Fall back to the generic storage API if the native helper is unavailable.
    }
  }

  const result = await storageService.listFiles(folder);

  if (result.isErr()) return 0;

  const files = result.value;
  if (files.length === 0) return 0;

  const sizes = await Promise.all(
    files.map(async (filePath) => {
      const sizeResult = await storageService.getFileSize(filePath);
      return sizeResult.isOk() ? sizeResult.value : 0;
    }),
  );

  return sizes.reduce((sum, size) => sum + size, 0);
}

async function calculateFolderSizeParallel(folders: string[]): Promise<Map<string, number>> {
  const results = await Promise.all(
    folders.map(async (folder) => {
      const size = await calculateFolderSize(folder);
      return [folder, size] as const;
    }),
  );

  return new Map(results);
}

async function getQuotaInfo(): Promise<{ total: number; used: number }> {
  if (!IS_TAURI && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      total: estimate.quota ?? 0,
      used: estimate.usage ?? 0,
    };
  }

  return { total: 0, used: 0 };
}

async function getStoragePath(): Promise<string> {
  if (hasNativeSupport(storageService)) {
    return storageService.getAppDataDir();
  }
  return "Browser OPFS";
}

async function getDbSize(): Promise<number> {
  if (!IS_TAURI && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return estimate.usage ?? 0;
    }
    catch {
      return 0;
    }
  }

  if (!IS_TAURI) {
    try {
      const tracks = await db.tracks.count();
      const artists = await db.artists.count();
      const albums = await db.albums.count();
      const tags = await db.tags.count();
      return (tracks + artists + albums + tags) * 500;
    }
    catch {
      return 0;
    }
  }

  return 0;
}

export async function collectStorageInfo(): Promise<StorageInfo> {
  const [folderSizes, dbSize, quota, storagePath, [tracksCount, albumsCount, artistsCount]] = await Promise.all([
    calculateFolderSizeParallel(["tracks", "lyrics"]),
    getDbSize(),
    getQuotaInfo(),
    getStoragePath(),
    Promise.all([db.tracks.count(), db.albums.count(), db.artists.count()]),
  ]);

  return {
    tracksSize: folderSizes.get("tracks") ?? 0,
    coversSize: 0,
    lyricsSize: folderSizes.get("lyrics") ?? 0,
    dbSize,
    quotaTotal: quota.total,
    quotaUsed: quota.used,
    tracksCount,
    albumsCount,
    artistsCount,
    storagePath,
  };
}

export async function clearLyricsData(): Promise<void> {
  const result = await storageService.listFiles("lyrics");

  if (result.isOk()) {
    await Promise.all(result.value.map(file => storageService.deleteFile(file)));
  }

  await db.tracks.toCollection().modify((track) => {
    delete track.lyricsPath;
  });
}

export async function clearAllData(): Promise<void> {
  const folders = ["tracks", "lyrics"];
  await Promise.all(
    folders.map(async (folder) => {
      const result = await storageService.listFiles(folder);
      if (result.isOk()) {
        await Promise.all(result.value.map(file => storageService.deleteFile(file)));
      }
    }),
  );

  await Promise.all([
    db.tracks.clear(),
    db.albums.clear(),
    db.artists.clear(),
    db.tags.clear(),
    db.playlists.clear(),
    db.folders.clear(),
    db.listenEvents.clear(),
    db.audioFeatures.clear(),
    db.trackChapters.clear(),
  ]);

  // The search index is worker-memory, rebuilt lazily from the database.
  // Without a reset it keeps serving the entities deleted above until reload.
  resetSearchIndex();
}

export async function clearFoldersData(): Promise<void> {
  await db.folders.clear();
}

export async function clearTimingsData(): Promise<void> {
  await Promise.all([
    db.listenEvents.clear(),
    db.audioFeatures.clear(),
    db.trackChapters.clear(),
  ]);
}
