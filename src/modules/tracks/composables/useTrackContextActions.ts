import { isLibraryTrack, type PlayerTrack, type Track } from "@/modules/player/types";
import type { ContextActions, TrackMenuSubject } from "@/modules/tracks/components/menu/type";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { usePlayerStore } from "@/modules/player/store/player.store";
import { ArtistId, PlaylistId, QueueItemId, type TrackId } from "@/types/ids";
import { useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { getLogger } from "@/lib/logger";
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
import { isRemoteTrack, trackHasLocalFile } from "@/modules/tracks/lib/trackPredicates";
import { promoteTrackToLibrary, removeTrackFromLibrary } from "@/modules/tracks/lib/libraryMembership";
import { downloadSubject } from "@/modules/downloads/enqueue";
import { cancelTrackDownload } from "@/modules/downloads/manager";
import { removeOfflineCopy as removeOfflineCopyFile } from "@/modules/downloads/removeCopy";
import { useDownloadsStore } from "@/modules/downloads/store/downloads.store";
import { invalidateLibraryData } from "@/queries/library.queries";
import { offlineCopyRepository } from "@/db/repositories";
import { openUrl } from "@tauri-apps/plugin-opener";
import { parseTrackRef } from "@/types/track-ref";
import { ytVideoIdFromStreamUrl } from "@/lib/stream-url";
import { getNdConfig } from "@/modules/sources/navidrome/config";
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
  track: Ref<PlayerTrack | null>,
  options: {
    playlistId?: RefLike<PlaylistId | undefined>;
    queueIndex?: RefLike<number | null>;
    queueItemId?: RefLike<QueueItemId | null>;
    /** Menu subject — lets DB-bound actions pin remote DTOs on demand. */
    subject?: RefLike<TrackMenuSubject | null>;
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

  /**
   * Resolves the track row a DB-bound action should operate on: the library
   * track as-is, or a remote DTO pinned on demand (like from ND browsing
   * just works). Null when the subject has no library identity (ephemeral).
   */
  const resolveDbTrack = async (): Promise<Track | null> => {
    const current = track.value;
    if (isLibraryTrack(current)) return current;

    const subject = options.subject?.value;
    if (subject?.kind !== "remote") return null;
    try {
      const pinned = await ensurePinned(subject);
      // The pin may have made its album/artist visible in the library.
      await invalidateLibraryData(queryClient);
      return pinned;
    }
    catch (error) {
      getLogger().error(`[Tracks] Pin failed for ${subject.dto.id}: ${String(error)}`);
      toast.error(t("track.pinFailed"));
      return null;
    }
  };

  const toggleLike = async () => {
    const current = await resolveDbTrack();
    if (!current) return;
    await toggleTrackLike(current);
  };

  const showDetails = () => {
    const current = track.value;
    if (!isLibraryTrack(current)) return;

    rightPanelStore.openTrackInfo({ track: current }, {
      scope: { type: "route", routeKey: route.fullPath },
      depth: 1,
    });
  };

  const showLyrics = () => {
    rightPanelStore.openLyrics({ depth: 1 });
  };

  const attachLyricsToTrack = async () => {
    const current = await resolveDbTrack();
    if (!current) return;
    await attachTrackLyrics(current);
  };

  const addToPlaylist = async (playlistId: PlaylistId) => {
    const current = await resolveDbTrack();
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
    if (!isLibraryTrack(current) || !playlistId) return;
    try {
      await removeTrackFromPlaylistAndSync(queryClient, playlistId, current.id);
    }
    catch {
      toast.error(t("playlist.removeTrackFailed"));
    }
  };

  const removeFromHistory = async () => {
    const current = track.value;
    if (!isLibraryTrack(current)) return;
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
    if (!isLibraryTrack(current)) return;
    router.push(routeLocation.album(current.albumId));
    options.onNavigate?.();
  };

  /**
   * Picks the file the "Save as…" export reads from: the track's own local
   * file, or its offline copy. Remote tracks without a copy have nothing to
   * export — storagePath is never read blindly.
   */
  const resolveExportPath = async (current: Track): Promise<string | null> => {
    if (trackHasLocalFile(current)) return current.storagePath;

    const copyResult = await offlineCopyRepository.findById(current.id);
    const copy = copyResult.isOk() ? copyResult.value : undefined;
    return copy?.storagePath ?? null;
  };

  const exportFile = async () => {
    const current = track.value;
    if (!isLibraryTrack(current)) return;

    const sourcePath = await resolveExportPath(current);
    if (!sourcePath) return;

    const fallbackExt = sourcePath.split(".").pop()?.toLowerCase() ?? "mp3";
    const fileName = sourcePath.split(/[\\/]/).pop() ?? `${current.title}.${fallbackExt}`;

    try {
      const fileBlob = await (async () => {
        if (IS_TAURI && hasNativeSupport(storageService)) {
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

  const downloadsStore = useDownloadsStore();

  /** The id downloads key on: the library row id or the remote DTO id. */
  const subjectTrackId = (): TrackId | null => {
    const subject = options.subject?.value;
    if (subject?.kind === "remote") return subject.dto.id;
    const current = track.value;
    return isLibraryTrack(current) ? (current.id as TrackId) : null;
  };

  const downloadOffline = async () => {
    const subject = options.subject?.value
      ?? (isLibraryTrack(track.value) ? { kind: "library" as const, track: track.value } : null);
    if (!subject || subject.kind === "ephemeral") return;
    try {
      await downloadSubject(subject);
    }
    catch (error) {
      getLogger().error(`[Downloads] Enqueue failed from the track menu: ${String(error)}`);
      toast.error(t("track.downloadFailed"));
    }
  };

  const cancelOfflineDownload = async () => {
    const trackId = subjectTrackId();
    const job = trackId ? downloadsStore.byTrackId[trackId] : undefined;
    if (job) await cancelTrackDownload(job.jobId);
  };

  const removeOfflineCopy = async () => {
    const trackId = subjectTrackId();
    if (!trackId) return;
    try {
      await removeOfflineCopyFile(trackId);
    }
    catch (error) {
      getLogger().error(`[Downloads] Removing the offline copy of ${trackId} failed: ${String(error)}`);
      toast.error(t("track.removeDownloadFailed"));
    }
  };

  const addToLibrary = async () => {
    try {
      const subject = options.subject?.value;
      if (subject?.kind === "remote") {
        await ensurePinned(subject);
      }
      else {
        const current = track.value;
        if (!isLibraryTrack(current) || !isRemoteTrack(current)) return;
        await promoteTrackToLibrary(current.id);
      }
      await invalidateLibraryData(queryClient);
      toast.success(t("track.addedToLibrary"));
    }
    catch (error) {
      getLogger().error(`[Tracks] Add to library failed: ${String(error)}`);
      toast.error(t("track.pinFailed"));
    }
  };

  const removeFromLibrary = async () => {
    const current = track.value;
    if (!isLibraryTrack(current) || !isRemoteTrack(current)) return;
    try {
      await removeTrackFromLibrary(current.id);
      await invalidateLibraryData(queryClient);
      toast.success(t("track.removedFromLibrary"));
    }
    catch (error) {
      getLogger().error(`[Tracks] Remove from library failed for ${current.id}: ${String(error)}`);
      toast.error(t("track.removeFromLibraryFailed"));
    }
  };

  /** yt → the watch page; nd → the server page (wired with ND settings, M2). */
  const externalUrl = (): string | null => {
    const subject = options.subject?.value;
    if (subject?.kind === "ephemeral" && subject.track.source.type === "url") {
      const videoId = ytVideoIdFromStreamUrl(subject.track.source.url);
      return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
    }

    const current = track.value;
    let id = null;
    if (subject?.kind === "remote") id = subject.dto.id;
    else if (isLibraryTrack(current)) id = current.id;
    if (!id) return null;

    const ref = parseTrackRef(id);
    if (ref.kind === "yt") return `https://www.youtube.com/watch?v=${ref.videoId}`;
    if (ref.kind === "nd") {
      const config = getNdConfig();
      if (!config) return null;
      let albumId;
      if (subject?.kind === "remote") albumId = subject.dto.albumId;
      else if (isLibraryTrack(current)) albumId = current.albumId;
      const albumRef = albumId ? parseTrackRef(albumId as unknown as typeof id) : null;
      return albumRef?.kind === "nd"
        ? `${config.baseUrl}/app/#/album/${albumRef.songId}/show`
        : config.baseUrl;
    }
    return null;
  };

  const openExternal = async () => {
    const url = externalUrl();
    if (!url) return;
    await openUrl(url);
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
    exportFile,
    downloadOffline,
    cancelOfflineDownload,
    removeOfflineCopy,
    addToLibrary,
    removeFromLibrary,
    openExternal,
  };
};
