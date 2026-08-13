import { convertFileSrc } from "@tauri-apps/api/core";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useImport } from "@/composables/useImport";
import { ephemeralFromUrl } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { youtubeProvider } from "../provider";
import { cleanupCacheFile } from "../lib/cache";
import { youtubeErrorMessage } from "../lib/errors";
import { proxiedThumbnail } from "../lib/thumbnail";
import type { YtPlayable } from "../types";
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
  const { t } = useI18n();

  const download = async (item: YtPlayable): Promise<void> => {
    const current = store.downloads[item.id];
    if (current && current.status !== "error") return;

    store.setDownload(item.id, { status: "downloading", percent: 0 });

    const result = await youtubeProvider.download(item.id, (event) => {
      if (event.type === "progress") {
        const { downloaded, total } = event.data;
        store.setDownload(item.id, {
          status: "downloading",
          percent: total ? Math.min(100, Math.round((downloaded / total) * 100)) : null,
        });
      }
      else {
        store.setDownload(item.id, { status: "processing", percent: null });
      }
    }, item.meta);

    if (result.isErr()) {
      store.setDownload(item.id, {
        status: "error",
        percent: null,
        error: result.error.message,
      });
      return;
    }

    store.setDownload(item.id, { status: "importing", percent: null });

    try {
      await importFromPaths([result.value.path]);
      await cleanupCacheFile(result.value.path);
      store.setDownload(item.id, { status: "done", percent: 100 });
    }
    catch (e) {
      store.setDownload(item.id, {
        status: "error",
        percent: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /** Stream immediately as an ephemeral track (no download). */
  const play = async (item: YtPlayable): Promise<void> => {
    if (store.resolvingId) return;
    store.resolvingId = item.id;

    const result = await youtubeProvider.resolve(item.id);
    store.resolvingId = null;

    if (result.isErr()) {
      toast.error(youtubeErrorMessage(result.error, t));
      return;
    }

    const track = ytEphemeralTrack({ ...item, id: result.value });
    await queue.setQueue([track], 0, { type: "manual" });
  };

  return { store, download, play };
}

/**
 * Builds an ephemeral queue track streaming over `ytstream://`. The scheme
 * resolves the googlevideo URL lazily on first request, so no `yt_resolve`
 * round-trip is needed up front — this is what makes synchronous
 * play-all queues possible.
 */
export function ytEphemeralTrack(item: YtPlayable) {
  const streamSrc = convertFileSrc(item.id, "ytstream");
  return ephemeralFromUrl(streamSrc, {
    title: item.title,
    artist: item.artist ?? undefined,
    albumName: item.meta?.album ?? undefined,
    duration: item.duration ?? undefined,
    cover: item.thumbnail ? proxiedThumbnail(item.thumbnail) : undefined,
  });
}
