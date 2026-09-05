import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import DeleteTracksDialog from "@/components/dialogs/DeleteTracksDialog.vue";
import { summonDialog } from "@/components/dialogs/summon";
import { getLogger } from "@/lib/logger";
import type { Track } from "@/modules/player/types";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import type { TrackSortKey } from "@/modules/tracks/types";
import { addTracksToPlaylistAndSync } from "@/queries/playlist.queries";
import {
  deleteTracksAndSync,
  getTracksByIdsSorted,
  setTracksLikedAndSync,
} from "@/queries/track.queries";
import type { PlaylistId, TrackId } from "@/types/ids";

export type BulkTrackAction = "play" | "playNext" | "addToQueue" | "toggleLike" | "addToPlaylist" | "delete";

export interface UseBulkTrackActionsOptions {
  selectedIds: ComputedRef<ReadonlySet<string>>;
  /** Loaded rows — the only place the like status of a selected id is known. */
  loadedTracks: Ref<Track[]> | ComputedRef<Track[]>;
  sortKey: Ref<TrackSortKey> | ComputedRef<TrackSortKey>;
  onDone?: (action: BulkTrackAction) => void;
}

export const useBulkTrackActions = (options: UseBulkTrackActionsOptions) => {
  const queryClient = useQueryClient();
  const queueStore = useQueueStore();
  const { t } = useI18n();

  const busy = ref(false);

  const ids = () => [...options.selectedIds.value] as TrackId[];

  const allLiked = computed(() => {
    const selected = options.selectedIds.value;
    let known = 0;
    for (const track of options.loadedTracks.value) {
      if (!selected.has(track.id)) continue;
      known++;
      if (!track.isLiked) return false;
    }
    return known > 0;
  });

  const run = async (action: BulkTrackAction, fn: () => Promise<void>) => {
    if (busy.value || options.selectedIds.value.size === 0) return;
    busy.value = true;
    try {
      await fn();
      options.onDone?.(action);
    }
    catch (err) {
      getLogger().warn(`[useBulkTrackActions] ${action} failed: ${String(err)}`);
      toast.error(t("library.selection.actionFailed"));
    }
    finally {
      busy.value = false;
    }
  };

  const fetchSelected = () => getTracksByIdsSorted(ids(), options.sortKey.value);

  const play = () => run("play", async () => {
    const tracks = await fetchSelected();
    if (tracks.length === 0) return;
    await queueStore.setQueue(tracks, 0, { type: "manual" });
  });

  const playNext = () => run("playNext", async () => {
    const tracks = await fetchSelected();
    queueStore.insertMultipleNext(tracks, { type: "manual" });
    toast.success(t("library.selection.addedToQueue", tracks.length));
  });

  const addToQueue = () => run("addToQueue", async () => {
    const tracks = await fetchSelected();
    queueStore.addMultipleToQueue(tracks, { type: "manual" });
    toast.success(t("library.selection.addedToQueue", tracks.length));
  });

  const toggleLike = () => run("toggleLike", async () => {
    const liked = !allLiked.value;
    const idList = ids();
    const changed = await setTracksLikedAndSync(queryClient, idList, liked);

    const idSet = new Set<string>(idList);
    for (const item of queueStore.queue) {
      if (item.track.kind === "library" && idSet.has(item.track.id)) {
        queueStore.syncTrackMetadata({ ...item.track, isLiked: liked });
      }
    }
    toast.success(t(liked ? "library.selection.liked" : "library.selection.unliked", changed));
  });

  const addToPlaylist = (playlistId: PlaylistId) => run("addToPlaylist", async () => {
    const tracks = await fetchSelected();
    await addTracksToPlaylistAndSync(queryClient, playlistId, tracks);
    toast.success(t("library.selection.addedToPlaylist", tracks.length));
  });

  const deleteSelected = async () => {
    const count = options.selectedIds.value.size;
    if (busy.value || count === 0) return;
    const confirmed = await summonDialog<boolean>(DeleteTracksDialog, { count }, { key: "delete-tracks" });
    if (!confirmed) return;

    await run("delete", async () => {
      const idList = ids();
      const idSet = new Set<string>(idList);
      const queueItemIds = queueStore.queue
        .filter(item => idSet.has(item.track.id))
        .map(item => item.id);

      const deleted = await deleteTracksAndSync(queryClient, idList);
      if (queueItemIds.length > 0) await queueStore.removeMultiple(queueItemIds);
      toast.success(t("library.selection.deleted", deleted));
    });
  };

  return {
    busy,
    allLiked,
    play,
    playNext,
    addToQueue,
    toggleLike,
    addToPlaylist,
    deleteSelected,
  };
};
