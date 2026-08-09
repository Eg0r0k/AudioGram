import { convertFileSrc } from "@tauri-apps/api/core";
import { remove } from "@tauri-apps/plugin-fs";
import { useImport } from "@/composables/useImport";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { ephemeralFromUrl } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { youtubeProvider } from "../provider";
import { proxiedThumbnail } from "../lib/thumbnail";
import type { YtSearchResult } from "../types";
import { useYoutubeStore } from "../store/youtube.store";

/**
 * Orchestrates a YouTube download → import into the library.
 *
 * Must be called from a component setup: it wires {@link useImport}, which
 * depends on the Vue Query injection context. Download state lives in the
 * store so progress survives navigation.
 */
export function useYoutube() {
  const store = useYoutubeStore();
  const queue = useQueueStore();
  const { importFromPaths } = useImport();

  const cleanupCacheFile = async (absolutePath: string): Promise<void> => {
    if (!IS_TAURI) return;
    try {
      await remove(absolutePath);
    }
    catch {
      // Leftover cache file is non-fatal; the folder is cleaned on next import run.
    }
  };

  const download = async (video: YtSearchResult): Promise<void> => {
    const current = store.downloads[video.id];
    if (current && current.status !== "error") return;

    store.setDownload(video.id, { status: "downloading", percent: 0 });

    const result = await youtubeProvider.download(video.id, (event) => {
      if (event.type === "progress") {
        const { downloaded, total } = event.data;
        store.setDownload(video.id, {
          status: "downloading",
          percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
        });
      }
      else {
        store.setDownload(video.id, { status: "processing", percent: null });
      }
    });

    if (result.isErr()) {
      store.setDownload(video.id, {
        status: "error",
        percent: null,
        error: result.error.message,
      });
      return;
    }

    store.setDownload(video.id, { status: "importing", percent: null });

    try {
      await importFromPaths([result.value.path]);
      await cleanupCacheFile(result.value.path);
      store.setDownload(video.id, { status: "done", percent: 100 });
    }
    catch (e) {
      store.setDownload(video.id, {
        status: "error",
        percent: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /** Stream a search result immediately as an ephemeral track (no download). */
  const play = async (video: YtSearchResult): Promise<void> => {
    if (store.resolvingId) return;
    store.resolvingId = video.id;
    store.error = null;

    const result = await youtubeProvider.resolve(video.id);
    store.resolvingId = null;

    if (result.isErr()) {
      store.error = result.error;
      return;
    }

    const streamSrc = convertFileSrc(result.value, "ytstream");
    const track = ephemeralFromUrl(streamSrc, {
      title: video.title,
      artist: video.uploader ?? undefined,
      albumName: undefined,
      cover: video.thumbnail ? proxiedThumbnail(video.thumbnail) : undefined,
    });
    await queue.setQueue([track], 0, { type: "manual" });
  };

  return { store, download, play };
}
