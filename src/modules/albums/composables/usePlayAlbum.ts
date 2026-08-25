import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { getLogger } from "@/lib/logger";
import type { LibraryItem } from "@/modules/library/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { sources } from "@/modules/sources";
import { sourceKindOf, sourceTrackToDisplay } from "@/modules/sources/lib/display";
import { getAlbumPageData } from "@/queries/album.queries";
import type { AlbumId } from "@/types/ids";

/**
 * Queues an album card from the start. Library albums come from Dexie; a
 * catalog card has no row behind it, so its tracks are fetched live.
 */
export const usePlayAlbum = () => {
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const playAlbum = async (item: LibraryItem) => {
    const albumId = item.id as AlbumId;

    if (item.isCatalog) {
      const kind = sourceKindOf(albumId);
      if (kind === "local") return;
      const result = await sources.get(kind).getAlbum(albumId);
      if (result.isErr()) {
        getLogger().error(`[Album] Queueing catalog album ${albumId} failed: ${result.error.message}`);
        toast.error(t("queue.addFailed"));
        return;
      }
      const tracks = result.value.tracks.map(sourceTrackToDisplay);
      if (tracks.length === 0) return;
      await queueStore.setQueue(tracks, 0, { type: "album", albumId });
      return;
    }

    const data = await getAlbumPageData(albumId);
    if (data.tracks.length === 0) return;

    await queueStore.setQueue(data.tracks, 0, { type: "album", albumId });
  };

  return { playAlbum };
};
