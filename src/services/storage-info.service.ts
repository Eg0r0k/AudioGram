import { invoke } from "@tauri-apps/api/core";
import { db } from "@/db";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { StorageInfo } from "@/types/storage-info";
import { createEventHook } from "@vueuse/core";

// Fired after a full wipe; main.ts subscribes the search-index reset here.
const allDataCleared = createEventHook<void>();
export const onAllDataCleared = allDataCleared.on;

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
    calculateFolderSizeParallel(["tracks", "lyrics", "offline/nd", "offline/yt"]),
    getDbSize(),
    getQuotaInfo(),
    getStoragePath(),
    Promise.all([db.tracks.count(), db.albums.count(), db.artists.count()]),
  ]);

  return {
    tracksSize: folderSizes.get("tracks") ?? 0,
    coversSize: 0,
    lyricsSize: folderSizes.get("lyrics") ?? 0,
    offlineNdSize: folderSizes.get("offline/nd") ?? 0,
    offlineYtSize: folderSizes.get("offline/yt") ?? 0,
    dbSize,
    quotaTotal: quota.total,
    quotaUsed: quota.used,
    tracksCount,
    albumsCount,
    artistsCount,
    storagePath,
  };
}

/**
 * Deletes every offline copy — rows first (a dangling row is worse than a
 * leftover file), then the files. Tracks and playlists stay untouched and
 * play over the live stream again.
 */
export async function clearOfflineData(): Promise<void> {
  const copies = await db.offlineCopies.toArray();
  await db.offlineCopies.clear();
  await Promise.all(copies.map(copy => storageService.deleteFile(copy.storagePath)));
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

/**
 * Every table the storage service consciously accounts for. `clearAllData`
 * wipes the live schema (`db.tables`) regardless of this set, so a forgotten
 * table can never survive a full wipe again. The set exists only to drive a
 * dev-time warning: if the Dexie schema (src/db/index.ts) gains a table that
 * isn't listed here, you get nudged to also revisit the *partial* clearers
 * (clearFoldersData / clearLyricsData / clearTimingsData).
 */
const ACKNOWLEDGED_TABLES: ReadonlySet<string> = new Set([
  "tracks",
  "albums",
  "artists",
  "tags",
  "playlists",
  "folders",
  "listenEvents",
  "covers",
  "radioStations",
  "audioFeatures",
  "trackChapters",
  "offlineCopies",
  "downloadJobs",
]);

function warnOnUnacknowledgedTables(): void {
  const unknown = db.tables
    .map(table => table.name)
    .filter(name => !ACKNOWLEDGED_TABLES.has(name));
  if (unknown.length === 0) return;

  console.warn(
    `[storage] Dexie schema has table(s) not acknowledged by the storage service: `
    + `${unknown.join(", ")}. clearAllData already wiped them (it iterates db.tables), `
    + `but add them to ACKNOWLEDGED_TABLES and check whether clearFoldersData, `
    + `clearLyricsData or clearTimingsData should include them.`,
  );
}

export async function clearAllData(): Promise<void> {
  const folders = ["tracks", "lyrics", "offline/nd", "offline/yt"];
  await Promise.all(
    folders.map(async (folder) => {
      const result = await storageService.listFiles(folder);
      if (result.isOk()) {
        await Promise.all(result.value.map(file => storageService.deleteFile(file)));
      }
    }),
  );

  // Wipe every table in the live Dexie schema. Deriving the list from
  // db.tables (instead of hardcoding it) means a newly-added table is cleared
  // automatically and can never be silently forgotten again.
  warnOnUnacknowledgedTables();
  await Promise.all(db.tables.map(table => table.clear()));

  // The search index is worker-memory, rebuilt lazily from the database.
  // Without a reset it keeps serving the entities deleted above until reload.
  await allDataCleared.trigger();
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
