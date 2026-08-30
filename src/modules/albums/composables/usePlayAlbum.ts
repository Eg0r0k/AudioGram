import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { getLogger } from "@/lib/logger";
import type { LibraryItem } from "@/modules/library/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { QueueSource } from "@/modules/queue/types";
import { sources } from "@/modules/sources";
import { sourceKindOf, sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { getAlbumPageData } from "@/queries/album.queries";
import { getPlaylistPageData } from "@/queries/playlist.queries";
import type { AlbumId, PlaylistId } from "@/types/ids";

/**
 * Queues a collection card from the start — an album, or a playlist on a
 * catalog artist's shelf. Library rows come from Dexie; a catalog card has
 * no row behind it, so its tracks are fetched live from the source.
 */
export const usePlayAlbum = () => {
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const playAlbum = async (item: LibraryItem) => {
    const isPlaylist = item.type === "playlist";
    const source: QueueSource = isPlaylist
      ? { type: "playlist", playlistId: item.id as PlaylistId }
      : { type: "album", albumId: item.id as AlbumId };

    if (item.isCatalog) {
      const kind = sourceKindOf(item.id);
      if (kind === "local") return;
      const provider = sources.get(kind);
      const result = isPlaylist
        ? await provider.getPlaylist(item.id as PlaylistId)
        : await provider.getAlbum(item.id as AlbumId);
      if (result.isErr()) {
        getLogger().error(`[Library] Queueing catalog ${item.type} ${item.id} failed: ${result.error.message}`);
        toast.error(t("queue.addFailed"));
        return;
      }
      const tracks = result.value.tracks.map(sourceTrackToDisplay);
      if (tracks.length === 0) return;
      await queueStore.setQueue(tracks, 0, source);
      return;
    }

    const data = isPlaylist
      ? await getPlaylistPageData(item.id as PlaylistId)
      : await getAlbumPageData(item.id as AlbumId);
    if (data.tracks.length === 0) return;

    await queueStore.setQueue(data.tracks, 0, source);
  };

  return { playAlbum };
};
