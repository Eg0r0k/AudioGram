import { defineStore } from "pinia";
import { computed, ref, shallowRef, markRaw, watch } from "vue";
import { Player, type PlayerState } from "lyra-audio";
import Hls from "hls.js";
import { useAudioSettingsStore } from "@/modules/settings/store/audio";
import {
  type PlayerTrack,
  isLibraryTrack,
  isEphemeralTrack,
  type RepeatMode,
} from "../types";
import { TrackSource, TrackState } from "@/db/entities";
import { StorageError } from "@/db/errors/storage.errors";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { storageService } from "@/db/storage";
import { statsService } from "@/services/stats.service";
import { TrackId } from "@/types/ids";
import { findActiveLyricsIndex, type LyricsLine } from "../lib/lrc";
import { queryClient } from "@/queries/client";
import { invalidateStatsQueries } from "@/queries/stats.queries";
import { loadTrackLyrics } from "../service/track-lyrics-loader.service";
import { getLogger } from "@/lib/logger";

export const usePlayerStore = defineStore("player", () => {
  const player = shallowRef<Player | null>(null);

  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);
  const isMuted = ref(false);
  const playbackRate = ref(1);
  const repeatMode = ref<RepeatMode>("off");
  const status = ref<PlayerState>("idle");
  const currentTrack = ref<PlayerTrack | null>(null);
  const graphRevision = ref(0);
  const trackEndedSignal = ref(0);
  const lyrics = ref<LyricsLine[]>([]);
  const lyricsStatus = ref<"idle" | "loading" | "ready" | "error">("idle");
  const sleepTimerEndsAt = ref<number | null>(null);
  const sleepTimerRemainingMs = ref(0);
  const sleepAfterCurrentTrack = ref(false);
  const sleepAfterCurrentTrackTriggeredOnEndSignal = ref(0);

  let lyricsRequestId = 0;
  let _activeFadeAbort: AbortController | null = null;
  let _sleepTimerTimeout: ReturnType<typeof setTimeout> | null = null;
  let _sleepTimerInterval: ReturnType<typeof setInterval> | null = null;
  let _activeBlobUrl: string | null = null;

  // ── Computed ────────────────────────────────────────────────────────────────

  const isPlaying = computed(
    () => status.value === "playing" || status.value === "buffering",
  );
  const isLoading = computed(() => status.value === "loading");

  const progress = computed(() => {
    if (duration.value <= 0) return 0;
    return (currentTime.value / duration.value) * 100;
  });

  const canPlay = computed(() => player.value?.isReady ?? false);

  const activeLyricsIndex = computed(() => {
    const lines = lyrics.value;
    if (lines.length === 0) return -1;
    return findActiveLyricsIndex(lines, currentTime.value);
  });

  const isSleepTimerActive = computed(() => sleepTimerEndsAt.value !== null);

  const isLiveStream = computed(() => {
    const track = currentTrack.value;
    if (!track) return false;
    if (isEphemeralTrack(track) && track.source.type === "url") {
      return duration.value <= 0;
    }
    if (isLibraryTrack(track) && track.source === TrackSource.REMOTE_HLS) {
      return duration.value <= 0;
    }
    return false;
  });

  const canSeek = computed(() => {
    if (!player.value) return false;
    if (isLiveStream.value) return false;
    if (duration.value <= 0) return false;
    return true;
  });

  const cancelActiveFade = () => {
    if (_activeFadeAbort) {
      _activeFadeAbort.abort();
      _activeFadeAbort = null;
    }
  };

  const clearSleepTimerHandles = () => {
    if (_sleepTimerTimeout !== null) {
      clearTimeout(_sleepTimerTimeout);
      _sleepTimerTimeout = null;
    }
    if (_sleepTimerInterval !== null) {
      clearInterval(_sleepTimerInterval);
      _sleepTimerInterval = null;
    }
  };

  const updateSleepTimerRemaining = () => {
    sleepTimerRemainingMs.value = sleepTimerEndsAt.value === null
      ? 0
      : Math.max(0, sleepTimerEndsAt.value - Date.now());
  };

  const cancelSleepTimer = () => {
    clearSleepTimerHandles();
    sleepTimerEndsAt.value = null;
    sleepTimerRemainingMs.value = 0;
  };

  const clearCurrentTrack = () => {
    if (_activeBlobUrl) {
      URL.revokeObjectURL(_activeBlobUrl);
      _activeBlobUrl = null;
    }
    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = 0;
    lyrics.value = [];
    lyricsStatus.value = "idle";
  };

  const stopListeningAndSync = (completed = false) => {
    statsService.stopListening(currentTime.value, completed)
      .then((event) => {
        if (!event) return;
        return invalidateStatsQueries(queryClient);
      })
      .catch(err => getLogger().error(`[Stats] ${String(err)}`));
  };

  const handleSleepTimerExpired = () => {
    clearSleepTimerHandles();
    sleepTimerEndsAt.value = null;
    sleepTimerRemainingMs.value = 0;
    pause();
  };

  const setSleepTimer = (durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      cancelSleepTimer();
      return;
    }
    sleepTimerEndsAt.value = Date.now() + durationMs;
  };

  const initPlayer
    = async () => {
      cancelActiveFade();

      if (player.value) {
        const oldPlayer = player.value;
        player.value = null;
        await oldPlayer.dispose();
      }

      const audioSettings = useAudioSettingsStore();
      const newPlayer = new Player({
        mode: "auto",
        Hls,
        playbackRate: playbackRate.value,
        loudnessNormalization: {
          enabled: audioSettings.isNormalizationEnabled,
          targetLufs: audioSettings.normalizationTargetLufs,
          preventClipping: audioSettings.normalizationPreventClipping,
        },
      });

      newPlayer.setVolume(volume.value);
      newPlayer.setMuted(isMuted.value);
      newPlayer.setPlaybackRate(playbackRate.value);
      player.value = markRaw(newPlayer);

      newPlayer.on("statechange", ({ to }) => {
        if (player.value === newPlayer) status.value = to;
      });
      newPlayer.on("ended", () => {
        if (player.value !== newPlayer) return;
        currentTime.value = 0;
        trackEndedSignal.value++;
      });
      newPlayer.on("timeupdate", ({ currentTime: t }) => {
        if (player.value === newPlayer) currentTime.value = t;
      });
      newPlayer.on("durationchange", (dur) => {
        if (player.value === newPlayer) duration.value = dur;
      });
      newPlayer.on("loadedmetadata", ({ duration: dur }) => {
        if (player.value === newPlayer) duration.value = dur;
      });
      newPlayer.on("canplay", () => {
        if (player.value !== newPlayer) return;
        duration.value = player.value.duration;
        graphRevision.value++;
      });
      newPlayer.on("volumechange", ({ volume: vol, muted }) => {
        if (player.value !== newPlayer) return;
        volume.value = vol;
        isMuted.value = muted;
      });
      newPlayer.on("ratechange", (rate) => {
        if (player.value === newPlayer) playbackRate.value = rate;
      });
      newPlayer.on("error", (err) => {
        if (player.value === newPlayer) getLogger().error(`[Player] error: ${String(err)}`);
      });

      return newPlayer;
    };

  // ── URL resolution ──────────────────────────────────────────────────────────

  /**
   * Resolves the audio URL/source for any PlayerTrack.
   *
   * Library tracks:
   *   LOCAL_INTERNAL → storageService.getAudioUrl (OPFS SW route or Tauri asset)
   *   LOCAL_EXTERNAL → storageService.getAudioUrl (native FS path, Tauri only)
   *   REMOTE_HLS     → storagePath IS the stream URL
   *
   * Ephemeral tracks:
   *   file → createObjectURL (web drag-and-drop / file picker)
   *   path → storageService.getAudioUrl (Tauri "Open with", no import)
   *   url  → used directly (radio, HLS stream)
   */
  const resolveTrackUrl = async (track: PlayerTrack): Promise<string | null> => {
    if (isEphemeralTrack(track)) {
      switch (track.source.type) {
        case "file": {
          if (_activeBlobUrl) {
            URL.revokeObjectURL(_activeBlobUrl);
          }
          _activeBlobUrl = URL.createObjectURL(track.source.file);
          return _activeBlobUrl;
        }

        case "path": {
          if (!IS_TAURI) {
            console.warn("[Player] path-based ephemeral tracks require Tauri");
            return null;
          }
          const result = await storageService.getAudioUrl(track.source.path);
          if (result.isErr()) throw result.error;
          return result.value;
        }

        case "url":
          return track.source.url;
      }
    }

    if (track.source === TrackSource.REMOTE_HLS) {
      return track.storagePath || null;
    }

    if (track.source === TrackSource.LOCAL_EXTERNAL && !IS_TAURI) {
      console.warn("[Player] LOCAL_EXTERNAL tracks require Tauri");
      return null;
    }

    const result = await storageService.getAudioUrl(track.storagePath);
    if (result.isErr()) throw result.error;
    return result.value;
  };

  const applyLoudnessMetadata = (p: Player, track: PlayerTrack) => {
    if (isLibraryTrack(track) && typeof track.integratedLufs === "number") {
      p.setLoudnessMetadata({
        integratedLufs: track.integratedLufs,
        truePeakDbtp: track.truePeakDbtp,
      });
    }
    else {
      p.clearLoudnessMetadata();
    }
  };

  const loadUrl = async (p: Player, url: string) => {
    const isHls = url.includes(".m3u8")
      || url.includes("application/vnd.apple.mpegurl");

    if (isHls) {
      await p.load({ url, type: "hls" });
    }
    else {
      await p.load(url);
    }
  };

  const play = async () => {
    if (!player.value || !player.value.isReady) {
      const track = currentTrack.value;
      if (!track) return;

      const url = await resolveTrackUrl(track);
      if (!url) {
        clearCurrentTrack();
        status.value = "idle";
        return;
      }

      const p = await initPlayer();
      await loadUrl(p, url);
      if (currentTime.value > 0) p.seek(currentTime.value);
      await p.play();
      return;
    }

    const wasCancellingFade = _activeFadeAbort !== null;
    cancelActiveFade();
    if (wasCancellingFade) player.value.cancelFade();

    const audioSettings = useAudioSettingsStore();
    const shouldFade = audioSettings.isFadeEnabled && audioSettings.fadeInDuration > 0;

    if (wasCancellingFade && player.value.isPlaying) {
      if (shouldFade) {
        await player.value.fadeTo(isMuted.value ? 0 : volume.value, audioSettings.fadeInDuration);
      }
      else {
        player.value.setVolume(volume.value);
      }
      return;
    }

    if (shouldFade) {
      await player.value.fadeIn(audioSettings.fadeInDuration);
    }
    else {
      player.value.setVolume(volume.value);
      await player.value.play();
    }
  };

  const pause = () => {
    if (!player.value || !isPlaying.value) return;

    if (_activeFadeAbort) return;

    const audioSettings = useAudioSettingsStore();
    const shouldFade = audioSettings.isFadeEnabled && audioSettings.fadeOutDuration > 0;

    if (shouldFade) {
      status.value = "paused";

      const ac = new AbortController();
      _activeFadeAbort = ac;
      player.value.fadeOut(audioSettings.fadeOutDuration).then(() => {
        if (ac.signal.aborted) return;
        player.value?.pause();
        _activeFadeAbort = null;
      });
    }
    else {
      player.value.pause();
    }
  };
  const togglePlay = async () => {
    if (_activeFadeAbort) {
      cancelActiveFade();
      player.value?.cancelFade();
      player.value?.setVolume(volume.value);

      if (status.value === "paused" && player.value) {
        status.value = "playing";
      }
      return;
    }

    if (isPlaying.value) pause();
    else await play();
  };

  const stop = () => {
    if (!player.value) return;
    cancelActiveFade();

    const audioSettings = useAudioSettingsStore();
    const shouldFade = audioSettings.isFadeEnabled && audioSettings.fadeOutDuration > 0;

    if (shouldFade) {
      const ac = new AbortController();
      _activeFadeAbort = ac;
      player.value.fadeOut(audioSettings.fadeOutDuration).then(() => {
        if (ac.signal.aborted) return;
        player.value?.stop();
        _activeFadeAbort = null;
        currentTime.value = 0;
      });
    }
    else {
      player.value.stop();
      currentTime.value = 0;
    }
  };

  /**
   * Main entry point for playing any track.
   * Throws on failure — queue.store uses this to skip to next.
   */
  const playPlayerTrack = async (track: PlayerTrack): Promise<void> => {
    // Guard: skip broken library tracks before even trying
    if (isLibraryTrack(track) && track.state === TrackState.BROKEN) {
      throw new Error(`Track is marked as broken: "${track.title}"`);
    }

    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync();
    }

    currentTime.value = 0;
    duration.value = 0;

    const p = await initPlayer();
    currentTrack.value = track;

    const url = await resolveTrackUrl(track);
    if (!url) {
      status.value = "error";
      player.value = null;
      clearCurrentTrack();
      throw new Error(`Cannot resolve audio source for: "${track.title}"`);
    }

    try {
      if (isEphemeralTrack(track) && track.source.type === "file") {
        await p.load(track.source.file);
      }
      else {
        await loadUrl(p, url);
      }

      applyLoudnessMetadata(p, track);
      await play();
    }
    catch (err) {
      status.value = "error";
      player.value = null;
      if (err instanceof StorageError) {
        clearCurrentTrack();
      }
      throw err;
    }
  };

  const seekTo = (seconds: number) => {
    if (!canSeek.value) return;
    cancelActiveFade();
    player.value?.seek(seconds);
  };

  const seekPercent = (percent: number) => {
    if (!canSeek.value) return;
    cancelActiveFade();
    player.value?.seekPercent(percent / 100);
  };

  const setVolume = (value: number) => {
    volume.value = value;
    player.value?.setVolume(value);
  };

  const setMuted = (muted: boolean) => {
    isMuted.value = muted;
    player.value?.setMuted(muted);
  };

  const setPlaybackRate = (value: number) => {
    if (!Number.isFinite(value)) return;
    playbackRate.value = Math.min(Math.max(value, 0.0625), 16);
    player.value?.setPlaybackRate(playbackRate.value);
  };

  const toggleMute = () => {
    player.value?.toggleMute();
  };

  const toggleRepeat = () => {
    const modes: RepeatMode[] = ["off", "all", "one"];
    const idx = modes.indexOf(repeatMode.value);
    repeatMode.value = modes[(idx + 1) % modes.length];
  };

  const dispose = async () => {
    cancelActiveFade();
    cancelSleepTimer();
    clearCurrentTrack();
    if (player.value) {
      await player.value.dispose();
      player.value = null;
    }
  };

  const getAudioGraph = () => player.value?.graph ?? null;

  const unlockAudio = async () => {
    if (player.value) {
      await player.value.unlockAudio();
    }
    else {
      const p = await initPlayer();
      await p.unlockAudio();
    }
  };

  watch(currentTrack, (track) => {
    if (!track || !isLibraryTrack(track)) return;
    statsService.startListening(
      track.id as TrackId,
      track.artistIds[0],
      track.albumId,
      track.duration,
    );
  });

  watch(currentTrack, async (track) => {
    const requestId = ++lyricsRequestId;
    lyrics.value = [];
    lyricsStatus.value = "idle";

    if (track && isLibraryTrack(track)) {
      lyricsStatus.value = "loading";
    }

    const result = await loadTrackLyrics(track);
    if (requestId !== lyricsRequestId) return;

    lyrics.value = result.lines;
    lyricsStatus.value = result.status;
  }, { immediate: true });

  watch(trackEndedSignal, (val) => {
    if (val === 0) return;
    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync(true);
    }
    if (!sleepAfterCurrentTrack.value) return;
    sleepAfterCurrentTrack.value = false;
    sleepAfterCurrentTrackTriggeredOnEndSignal.value = val;
  });

  watch(sleepTimerEndsAt, (endsAt) => {
    clearSleepTimerHandles();
    if (endsAt === null) {
      sleepTimerRemainingMs.value = 0;
      return;
    }

    updateSleepTimerRemaining();
    if (sleepTimerRemainingMs.value <= 0) {
      handleSleepTimerExpired();
      return;
    }

    _sleepTimerInterval = setInterval(updateSleepTimerRemaining, 1000);
    _sleepTimerTimeout = setTimeout(handleSleepTimerExpired, sleepTimerRemainingMs.value);
  }, { immediate: true });

  return {
    player,
    status,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isPlaying,
    isLoading,
    repeatMode,
    currentTrack,
    lyrics,
    lyricsStatus,
    activeLyricsIndex,
    graphRevision,
    trackEndedSignal,
    sleepTimerEndsAt,
    sleepTimerRemainingMs,
    isSleepTimerActive,
    sleepAfterCurrentTrack,
    progress,
    canPlay,
    isLiveStream,
    canSeek,
    play,
    pause,
    togglePlay,
    playPlayerTrack,
    stop,
    seekTo,
    seekPercent,
    setVolume,
    setPlaybackRate,
    toggleMute,
    toggleRepeat,
    getAudioGraph,
    dispose,
    setMuted,
    setSleepTimer,
    cancelSleepTimer,
    clearCurrentTrack,
    unlockAudio,
  };
}, {
  persist: {
    key: "lyra-player",
    pick: [
      "volume",
      "isMuted",
      "playbackRate",
      "repeatMode",
      "currentTrack",
      "currentTime",
      "duration",
      "sleepTimerEndsAt",
    ],
  },
});
