import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { AlbumId, PlaylistId } from "@/types/ids";
import { getLogger } from "@/lib/logger";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { sources } from "@/modules/sources";
import { sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { enqueueNdAlbumDownload, enqueueNdPlaylistDownload } from "@/modules/downloads/enqueue";
import type { LibraryItem } from "../types";
import { getAlbumPageData } from "@/queries/album.queries";
import { getPlaylistPageData } from "@/queries/playlist.queries";
import { getAllTracksForQueue, getLikedTracksPageData } from "@/queries/track.queries";

export function useLibraryContextActions() {
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const addToQueue = async (item: LibraryItem) => {
    switch (item.type) {
      case "artist":
        return;

      case "album": {
        const { tracks } = await getAlbumPageData(AlbumId(item.id));
        if (tracks.length === 0) return;

        queueStore.addMultipleToQueue(tracks, {
          type: "album",
          albumId: AlbumId(item.id),
        });
        break;
      }

      case "playlist": {
        const { tracks } = await getPlaylistPageData(PlaylistId(item.id));
        if (tracks.length === 0) return;

        queueStore.addMultipleToQueue(tracks, {
          type: "playlist",
          playlistId: PlaylistId(item.id),
        });
        break;
      }

      case "liked": {
        const { tracks } = await getLikedTracksPageData();
        if (tracks.length === 0) return;

        queueStore.addMultipleToQueue(tracks, {
          type: "liked",
        });
        break;
      }

      case "allMedia": {
        const tracks = await getAllTracksForQueue("date_added_desc");
        if (tracks.length === 0) return;

        queueStore.addMultipleToQueue(tracks, {
          type: "allMedia",
        });
        break;
      }

      case "folder":
        return;
    }

    toast.success(t("queue.added"));
  };

  /**
   * Catalog row (ND browsing): tracks come from the server, not Dexie.
   * Queueing shadow-pins them on play, exactly like the ND album page.
   */
  const addCatalogToQueue = async (item: LibraryItem) => {
    const provider = sources.get("nd");
    const result = item.type === "album"
      ? await provider.getAlbum(AlbumId(item.id))
      : await provider.getPlaylist(PlaylistId(item.id));

    if (result.isErr()) {
      getLogger().error(`[ND] Queueing ${item.type} ${item.id} failed: ${result.error.message}`);
      toast.error(t("queue.addFailed"));
      return;
    }

    const tracks = result.value.tracks.map(sourceTrackToDisplay);
    if (tracks.length === 0) return;

    queueStore.addMultipleToQueue(
      tracks,
      item.type === "album"
        ? { type: "album", albumId: AlbumId(item.id) }
        : { type: "playlist", playlistId: PlaylistId(item.id) },
    );
    toast.success(t("queue.added"));
  };

  /** Batch offline download of a catalog album/playlist. */
  const downloadCatalog = async (item: LibraryItem) => {
    try {
      const batchId = item.type === "album"
        ? await enqueueNdAlbumDownload(AlbumId(item.id))
        : await enqueueNdPlaylistDownload(PlaylistId(item.id));
      if (!batchId) toast.info(t("media.nothingToDownload"));
    }
    catch (error) {
      getLogger().error(`[ND] Batch download of ${item.type} ${item.id} failed: ${String(error)}`);
      toast.error(t("track.downloadFailed"));
    }
  };

  return {
    addToQueue,
    addCatalogToQueue,
    downloadCatalog,
  };
}
