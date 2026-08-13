import { ref, computed } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { StorageInfo } from "../schema/storage";
import { collectStorageInfo, clearAllData, clearFoldersData, clearLyricsData, clearOfflineData, clearTimingsData } from "@/services/storage-info.service";
import { formatBytes } from "@/lib/format/memory";
import { useLibraryStore } from "@/modules/library/store/library.store";

export function useStorageSettings() {
  const info = ref<StorageInfo | null>(null);
  const isLoading = ref(false);
  const isClearing = ref(false);

  const queryClient = useQueryClient();
  const libraryStore = useLibraryStore();

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalUsedByApp = computed(() => {
    if (!info.value) return 0;
    return info.value.tracksSize + info.value.lyricsSize + info.value.dbSize
      + info.value.offlineNdSize + info.value.offlineYtSize;
  });

  const formatted = computed(() => {
    if (!info.value) {
      return {
        tracksSize: "—",
        lyricsSize: "—",
        offlineTotal: "—",
        offlineNdSize: "—",
        offlineYtSize: "—",
        hasOffline: false,
        dbSize: "—",
        totalUsed: "—",
        quotaTotal: "—",
        quotaUsed: "—",
        quotaFree: "—",
        tracksCount: 0,
        albumsCount: 0,
        artistsCount: 0,
        storagePath: "—",
        usagePercent: 0,
      };
    }

    const i = info.value;

    return {
      tracksSize: formatBytes(i.tracksSize),
      lyricsSize: formatBytes(i.lyricsSize),
      offlineTotal: formatBytes(i.offlineNdSize + i.offlineYtSize),
      offlineNdSize: formatBytes(i.offlineNdSize),
      offlineYtSize: formatBytes(i.offlineYtSize),
      hasOffline: i.offlineNdSize + i.offlineYtSize > 0,
      dbSize: formatBytes(i.dbSize),
      totalUsed: formatBytes(totalUsedByApp.value),
      quotaTotal: i.quotaTotal > 0 ? formatBytes(i.quotaTotal) : null,
      quotaUsed: i.quotaUsed > 0 ? formatBytes(i.quotaUsed) : null,
      quotaFree: i.quotaTotal > 0 ? formatBytes(i.quotaTotal - i.quotaUsed) : null,
      tracksCount: i.tracksCount,
      albumsCount: i.albumsCount,
      artistsCount: i.artistsCount,
      storagePath: i.storagePath,
      usagePercent: i.quotaTotal > 0
        ? Math.round((i.quotaUsed / i.quotaTotal) * 100)
        : 0,
    };
  });

  async function refresh() {
    isLoading.value = true;
    try {
      info.value = await collectStorageInfo();
    }
    finally {
      isLoading.value = false;
    }
  }

  async function clearAllDataHandler() {
    isClearing.value = true;
    try {
      await clearAllData();
      libraryStore.clearPins();
      const keys = [
        ["library", "summary"],
        ["artists"],
        ["albums"],
        ["playlists"],
        ["tracks", "liked"],
      ];
      await Promise.all(
        keys.map(key => queryClient.invalidateQueries({ queryKey: key })),
      );
      await Promise.all(
        keys.map(key => queryClient.refetchQueries({ queryKey: key })),
      );
      await refresh();
    }
    finally {
      isClearing.value = false;
    }
  }

  async function clearLyricsDataHandler() {
    isClearing.value = true;
    try {
      await clearLyricsData();
      await queryClient.invalidateQueries({ queryKey: ["tracks"] });
      await refresh();
    }
    finally {
      isClearing.value = false;
    }
  }

  async function clearFoldersDataHandler() {
    isClearing.value = true;
    try {
      await clearFoldersData();
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
      await queryClient.invalidateQueries({ queryKey: ["library", "summary"] });
      await refresh();
    }
    finally {
      isClearing.value = false;
    }
  }

  async function clearOfflineDataHandler() {
    isClearing.value = true;
    try {
      await clearOfflineData();
      await queryClient.invalidateQueries({ queryKey: ["offlineCopies"] });
      await refresh();
    }
    finally {
      isClearing.value = false;
    }
  }

  async function clearTimingsDataHandler() {
    isClearing.value = true;
    try {
      await clearTimingsData();
      await queryClient.invalidateQueries({ queryKey: ["stats"] });
      await queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      await refresh();
    }
    finally {
      isClearing.value = false;
    }
  }

  return {
    info,
    isLoading,
    isClearing,
    formatted,
    refresh,
    clearAllData: clearAllDataHandler,
    clearLyricsData: clearLyricsDataHandler,
    clearFoldersData: clearFoldersDataHandler,
    clearOfflineData: clearOfflineDataHandler,
    clearTimingsData: clearTimingsDataHandler,
  };
}
