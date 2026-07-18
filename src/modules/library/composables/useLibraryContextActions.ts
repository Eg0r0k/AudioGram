import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { AlbumId, PlaylistId } from "@/types/ids";
import { useQueueStore } from "@/modules/queue/store/queue.store";
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

  return {
    addToQueue,
  };
}
