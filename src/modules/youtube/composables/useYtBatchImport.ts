import { computed, readonly, ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { musicLibraryEngine } from "@/services/importer.service";
import { invalidateLibraryData } from "@/queries/library.queries";
import {
  addTracksToPlaylistAndSync,
  createPlaylistAndSync,
} from "@/queries/playlist.queries";
import { getTracksByIds } from "@/queries/track.queries";
import type { PlaylistId, TrackId } from "@/types/ids";
import { youtubeProvider } from "../provider";
import { cleanupCacheFile } from "../lib/cache";
import type { YtPlayable } from "../types";
import { useYoutubeStore } from "../store/youtube.store";

export type YtBatchStatus = "idle" | "running" | "cancelling" | "done";
export type YtBatchItemStatus
  = "pending" | "downloading" | "importing" | "done" | "error" | "skipped";

export interface YtBatchItem {
  videoId: string;
  title: string;
  status: YtBatchItemStatus;
  percent: number | null;
  error?: string;
  trackId?: TrackId;
}

interface YtBatchState {
  status: YtBatchStatus;
  playlistId: PlaylistId | null;
  playlistName: string;
  items: YtBatchItem[];
  currentIndex: number;
}

// Module-level so progress survives navigation between pages.
const state = ref<YtBatchState>({
  status: "idle",
  playlistId: null,
  playlistName: "",
  items: [],
  currentIndex: 0,
});

let cancelRequested = false;

/**
 * Batch "Import to library": creates a local playlist, downloads the selected
 * YouTube tracks one-by-one (progress per track), imports each file through
 * the library engine DIRECTLY (bypassing the global import sheet, which would
 * hijack the UI per track) and finally adds all imported tracks to the
 * playlist. Must be called from component setup (Vue Query context).
 */
export function useYtBatchImport() {
  const queryClient = useQueryClient();
  const store = useYoutubeStore();
  const { t } = useI18n();

  const finishedCount = computed(() =>
    state.value.items.filter(item =>
      item.status === "done" || item.status === "error" || item.status === "skipped",
    ).length,
  );

  const isRunning = computed(
    () => state.value.status === "running" || state.value.status === "cancelling",
  );

  async function downloadOne(item: YtBatchItem, playable: YtPlayable): Promise<void> {
    item.status = "downloading";
    item.percent = 0;
    store.setDownload(item.videoId, { status: "downloading", percent: 0 });

    const result = await youtubeProvider.download(item.videoId, (event) => {
      if (event.type === "progress") {
        const { downloaded, total } = event.data;
        const percent = total ? Math.min(100, Math.round((downloaded / total) * 100)) : null;
        item.percent = percent;
        store.setDownload(item.videoId, { status: "downloading", percent });
      }
      else {
        store.setDownload(item.videoId, { status: "processing", percent: null });
      }
    }, playable.meta);

    if (result.isErr()) {
      const cancelled = result.error.kind === "CANCELLED";
      item.status = cancelled ? "skipped" : "error";
      if (!cancelled) item.error = result.error.message;
      store.setDownload(item.videoId, {
        status: cancelled ? "downloading" : "error",
        percent: null,
        error: cancelled ? undefined : result.error.message,
      });
      return;
    }

    item.status = "importing";
    store.setDownload(item.videoId, { status: "importing", percent: null });

    try {
      const batch = await musicLibraryEngine.importFromPaths([result.value.path]);
      await cleanupCacheFile(result.value.path);

      const success = batch.successful[0];
      if (success) {
        item.trackId = success.trackId;
        item.status = "done";
        item.percent = 100;
        store.setDownload(item.videoId, { status: "done", percent: 100 });
      }
      else if (batch.skipped > 0) {
        // Duplicate fingerprint — already in the library, but the engine does
        // not return the existing TrackId, so it cannot join the playlist (v1).
        item.status = "skipped";
        store.setDownload(item.videoId, { status: "done", percent: 100 });
      }
      else {
        const failure = batch.failed[0];
        item.status = "error";
        item.error = failure?.error.message ?? "import failed";
        store.setDownload(item.videoId, {
          status: "error",
          percent: null,
          error: item.error,
        });
      }
    }
    catch (e) {
      item.status = "error";
      item.error = e instanceof Error ? e.message : String(e);
      store.setDownload(item.videoId, { status: "error", percent: null, error: item.error });
    }
  }

  async function start(playlistName: string, tracks: YtPlayable[]): Promise<void> {
    if (isRunning.value) {
      toast.error(t("youtube.import.alreadyRunning"));
      return;
    }
    if (tracks.length === 0) return;

    cancelRequested = false;

    const playlist = await createPlaylistAndSync(queryClient, playlistName);

    state.value = {
      status: "running",
      playlistId: playlist.id,
      playlistName,
      items: tracks.map(track => ({
        videoId: track.id,
        title: track.title,
        status: "pending",
        percent: null,
      })),
      currentIndex: 0,
    };

    for (let i = 0; i < tracks.length; i++) {
      if (cancelRequested) {
        for (const item of state.value.items) {
          if (item.status === "pending") item.status = "skipped";
        }
        break;
      }
      state.value.currentIndex = i;
      await downloadOne(state.value.items[i], tracks[i]);
    }

    const importedIds = state.value.items
      .map(item => item.trackId)
      .filter((id): id is TrackId => id !== undefined);

    if (importedIds.length > 0) {
      const importedTracks = await getTracksByIds(importedIds);
      await addTracksToPlaylistAndSync(queryClient, playlist.id, importedTracks);
      await invalidateLibraryData(queryClient);
    }

    const ok = importedIds.length;
    const failed = state.value.items.filter(item => item.status === "error").length;
    const skipped = state.value.items.filter(item => item.status === "skipped").length;
    toast.success(t("youtube.import.summary", { ok, failed, skipped }));

    state.value.status = "done";
  }

  function cancel(): void {
    if (!isRunning.value) return;
    cancelRequested = true;
    state.value.status = "cancelling";
    const current = state.value.items[state.value.currentIndex];
    if (current && current.status === "downloading") {
      // Fire-and-forget: the running loop observes the CANCELLED error itself.
      youtubeProvider.cancelDownload(current.videoId).match(() => {}, () => {});
    }
  }

  return {
    state: readonly(state),
    isRunning,
    finishedCount,
    start,
    cancel,
  };
}
