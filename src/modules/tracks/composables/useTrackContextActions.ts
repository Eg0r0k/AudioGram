import type { Track } from "@/modules/player/types";
import type { ContextActions } from "@/modules/tracks/components/menu/type";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { ArtistId, PlaylistId, QueueItemId } from "@/types/ids";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import type { Ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { storageService } from "@/db/storage";
import { hasNativeSupport } from "@/db/storage/IFileStorage";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { routeLocation } from "@/app/router/route-locations";
import { useAttachTrackLyrics } from "./useAttachTrackLyrics";
import { useToggleTrackLike } from "./useToggleTrackLike";
import { canDownloadTrack } from "@/modules/tracks/lib/trackPredicates";
import {
  addTrackToPlaylistAndSync,
  removeTrackFromPlaylistAndSync,
} from "@/queries/playlist.queries";
import { useRightPanelStore } from "@/modules/right-panel/store/right-panel.store";
import { statsService } from "@/services/stats.service";

interface RefLike<T> {
  value: T;
}

export const useTrackContextActions = (
  track: Ref<Track | null>,
  options: {
    playlistId?: RefLike<PlaylistId | undefined>;
    queueIndex?: RefLike<number | null>;
    queueItemId?: RefLike<QueueItemId | null>;
    onNavigate?: () => void;
  } = {},
): ContextActions => {
  const router = useRouter();
  const route = useRoute();
  const queueStore = useQueueStore();
  const playerStore = usePlayerStore();
  const rightPanelStore = useRightPanelStore();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { attachTrackLyrics } = useAttachTrackLyrics();
  const { toggleTrackLike } = useToggleTrackLike();

  const play = () => {
    const current = track.value;
    if (!current) return;
    playerStore.playPlayerTrack(current);
  };

  const playNext = () => {
    const current = track.value;
    if (!current) return;
    queueStore.insertNext(current);
  };

  const addToQueue = () => {
    const current = track.value;
    if (!current) return;
    queueStore.addToQueue(current);
    toast.success(t("queue.added"), {
      action: {
        label: t("queue.goToQueue"),
      },
    });
  };

  const toggleLike = async () => {
    const current = track.value;
    if (!current) return;
    await toggleTrackLike(current);
  };

  const showDetails = () => {
    const current = track.value;
    if (!current) return;

    rightPanelStore.openTrackInfo({ track: current }, {
      scope: { type: "route", routeKey: route.fullPath },
      depth: 1,
    });
  };

  const showLyrics = () => {
    rightPanelStore.openLyrics({ depth: 1 });
  };

  const attachLyricsToTrack = async () => {
    const current = track.value;
    if (!current) return;
    await attachTrackLyrics(current);
  };

  const addToPlaylist = async (playlistId: PlaylistId) => {
    const current = track.value;
    if (!current) return;
    try {
      await addTrackToPlaylistAndSync(queryClient, playlistId, current);
    }
    catch {
      toast.error(t("playlist.addTrackFailed"));
    }
  };

  const removeFromQueue = () => {
    const queueItemId = options.queueItemId?.value;
    if (!queueItemId) return;
    queueStore.removeFromQueue(queueItemId);
  };

  const removeFromPlaylist = async () => {
    const current = track.value;
    const playlistId = options.playlistId?.value;
    if (!current || !playlistId) return;
    try {
      await removeTrackFromPlaylistAndSync(queryClient, playlistId, current.id);
    }
    catch {
      toast.error(t("playlist.removeTrackFailed"));
    }
  };

  const removeFromHistory = async () => {
    const current = track.value;
    if (!current) return;
    try {
      await statsService.removeFromHistory(current.id);
    }
    catch {
      toast.error(t("track.removeFromHistoryFailed"));
    }
  };

  const goToArtist = (artistId: ArtistId) => {
    router.push(routeLocation.artist(artistId));
    options.onNavigate?.();
  };

  const goToAlbum = () => {
    const current = track.value;
    if (!current) return;
    router.push(routeLocation.album(current.albumId));
    options.onNavigate?.();
  };

  const download = async () => {
    const current = track.value;
    if (!current || !canDownloadTrack(current)) return;

    const sourcePath = current.storagePath;
    const fallbackExt = sourcePath.split(".").pop()?.toLowerCase() ?? "mp3";
    const fileName = sourcePath.split(/[\\/]/).pop() ?? `${current.title}.${fallbackExt}`;

    try {
      const fileBlob = await (async () => {
        if (current.source.toString() && IS_TAURI && hasNativeSupport(storageService)) {
          const isAbsolutePath = /^(?:[a-zA-Z]:[\\/]|\/)/.test(sourcePath);

          if (isAbsolutePath) {
            const readResult = await storageService.readFile(sourcePath);
            if (readResult.isErr()) throw readResult.error;
            return new Blob([readResult.value]);
          }
        }

        const fileResult = await storageService.getFile(sourcePath);
        if (fileResult.isErr()) throw fileResult.error;
        return fileResult.value;
      })();

      if (IS_TAURI) {
        const targetPath = await save({
          defaultPath: fileName,
          filters: [{
            name: "Audio",
            extensions: [fallbackExt],
          }],
        });

        if (!targetPath) return;

        await writeFile(targetPath, new Uint8Array(await fileBlob.arrayBuffer()));
        toast.success(t("track.downloadSuccess"));
        return;
      }

      const objectUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(t("track.downloadSuccess"));
    }
    catch {
      toast.error(t("track.downloadFailed"));
    }
  };

  return {
    play,
    playNext,
    addToQueue,
    showDetails,
    showLyrics,
    toggleLike,
    attachLyrics: attachLyricsToTrack,
    addToPlaylist,
    removeFromQueue,
    removeFromPlaylist,
    removeFromHistory,
    goToArtist,
    goToAlbum,
    download,
  };
};
