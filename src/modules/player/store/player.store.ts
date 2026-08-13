import { defineStore } from "pinia";
import { computed, ref, shallowRef, markRaw } from "vue";
import { Player, type PlayerState } from "lyra-audio";
import Hls from "hls.js";
import { useAudioSettingsStore } from "@/modules/settings/store/audio";
import {
  type PlayerTrack,
  isLibraryTrack,
  isEphemeralTrack,
  type EphemeralTrack,
  type Track,
  type RepeatMode,
} from "../types";
import { TrackSource, TrackState } from "@/db/entities";
import { StorageError } from "@/db/errors/storage.errors";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { storageService } from "@/db/storage";
import { offlineCopyRepository } from "@/db/repositories";
import { sources } from "@/modules/sources";
import { statsService } from "@/services/stats.service";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { useEventBus } from "@vueuse/core";
import { trackChangedEvent, trackEndedEvent } from "../lib/player-events";
import { useDelayedIndicator } from "../composables/useDelayedIndicator";
import { useCountdown } from "../composables/useCountdown";
import { getLogger } from "@/lib/logger";

export const usePlayerStore = defineStore("player", () => {
  const player = shallowRef<Player | null>(null);

  const trackChangedBus = useEventBus(trackChangedEvent);
  const trackEndedBus = useEventBus(trackEndedEvent);

  const currentTime = ref(0);
  const duration = ref(0);
  const volume = ref(1);
  const isMuted = ref(false);
  const playbackRate = ref(1);
  const repeatMode = ref<RepeatMode>("off");
  const status = ref<PlayerState>("idle");
  const currentTrack = ref<PlayerTrack | null>(null);
  const graphRevision = ref(0);
  const sleepAfterCurrentTrack = ref(false);

  const {
    endsAt: sleepTimerEndsAt,
    remainingMs: sleepTimerRemainingMs,
    isActive: isSleepTimerActive,
    set: setSleepTimer,
    cancel: cancelSleepTimer,
  } = useCountdown({ onExpire: () => pause() });

  // Monotonic token claimed by each play request. lyra's load() already
  // cancels a superseded in-flight load on the shared instance, but a stale
  // request waking up after an await could still call load() *after* the
  // newer one and win by "last call" semantics — the token drops it first.
  let _playRequestId = 0;
  let _activeFadeAbort: AbortController | null = null;
  let _activeBlobUrl: string | null = null;

  const isPlaying = computed(
    () => status.value === "playing" || status.value === "buffering",
  );
  const isLoading = computed(() => status.value === "loading");

  // Local tracks (OPFS/FS) load in tens of milliseconds, so a spinner bound
  // directly to `isLoading` would flash on every start; the delayed indicator
  // only shows up for real waits (slow disk, remote streams, HLS buffering).
  const showLoadingIndicator = useDelayedIndicator(isLoading);

  const progress = computed(() => {
    if (duration.value <= 0) return 0;
    return (currentTime.value / duration.value) * 100;
  });

  const canPlay = computed(() => player.value?.isReady ?? false);

  const isLiveStream = computed(() => {
    const track = currentTrack.value;
    if (!track) return false;
    const dur = duration.value;
    if (player.value?.isLive) return true;
    // While a source is still loading, duration is 0 because it's *unknown*,
    // not because the stream is endless — don't flag live until it settles.
    if (isLoading.value) return false;
    if (isEphemeralTrack(track) && track.source.type === "url") {
      return dur <= 0;
    }
    if (isLibraryTrack(track) && track.source === TrackSource.REMOTE_HLS) {
      return dur <= 0;
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

  const clearCurrentTrack = () => {
    if (_activeBlobUrl) {
      URL.revokeObjectURL(_activeBlobUrl);
      _activeBlobUrl = null;
    }
    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = 0;
    trackChangedBus.emit(null);
  };

  const stopListeningAndSync = (completed = false) => {
    statsService.stopListening(currentTime.value, completed)
      .catch(err => getLogger().error(`[Stats] ${String(err)}`));
  };

  // Drops a broken instance so the next play starts on a fresh engine.
  // Fire-and-forget: nothing awaits teardown of an errored player.
  const discardPlayer = () => {
    const broken = player.value;
    player.value = null;
    broken?.dispose().catch(() => {});
  };

  /**
   * Returns the app-lifetime Player, creating it on first use. Tracks reuse
   * the same engine: lyra's load() tears down the previous source itself and
   * cancels a superseded in-flight load internally, so recreating the
   * instance per track is unnecessary (and was the root of orphaned-player
   * races). A new instance appears only after dispose() or a load error.
   */
  const ensurePlayer = (): Player => {
    if (player.value) return player.value;

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

    // Guards keep a disposed-then-replaced instance (dispose(), load-error
    // recovery) from mutating state that now belongs to its successor.
    newPlayer.on("statechange", ({ to }) => {
      if (player.value === newPlayer) status.value = to;
    });
    newPlayer.on("ended", () => {
      if (player.value !== newPlayer) return;
      currentTime.value = 0;
      trackEndedBus.emit();
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

  /**
   * Resolves the audio URL/source for any PlayerTrack — the single resolution
   * point for playback.
   *
   * Library tracks:
   *   1. local file (LOCAL_INTERNAL/LOCAL_EXTERNAL) → storageService.getAudioUrl
   *   2. remote with an offline copy → storageService.getAudioUrl(copy path)
   *   3. remote otherwise → sources.forTrack(id).resolveStreamUrl(id)
   *   (REMOTE_HLS: storagePath IS the stream URL — folds into sources in M6)
   *
   * Ephemeral tracks:
   *   file → createObjectURL (web drag-and-drop / file picker)
   *   path → storageService.getAudioUrl (Tauri "Open with", no import)
   *   url  → used directly (radio, YT stream proxy)
   */
  const resolvePlayback = async (track: PlayerTrack): Promise<string | null> => {
    if (isEphemeralTrack(track)) return resolveEphemeralPlayback(track);
    return resolveLibraryPlayback(track);
  };

  const resolveEphemeralPlayback = async (track: EphemeralTrack): Promise<string | null> => {
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
  };

  const resolveLibraryPlayback = async (track: Track): Promise<string | null> => {
    if (track.source === TrackSource.REMOTE_HLS) {
      return track.storagePath || null;
    }

    const isRemote = track.source === TrackSource.REMOTE_SUBSONIC
      || track.source === TrackSource.REMOTE_YT;

    if (!isRemote) {
      if (track.source === TrackSource.LOCAL_EXTERNAL && !IS_TAURI) {
        console.warn("[Player] LOCAL_EXTERNAL tracks require Tauri");
        return null;
      }
      const result = await storageService.getAudioUrl(track.storagePath);
      if (result.isErr()) throw result.error;
      return result.value;
    }

    // Playing from live browsing shadow-pins the row (pinned = 0) so
    // history, stats and queue persistence have valid FKs. Fire-and-forget:
    // playback must not wait for the cascade.
    if (track.sourceDto) {
      ensurePinned({ kind: "remote", dto: track.sourceDto }, { pinned: 0 }).catch((error) => {
        // A failed shadow-pin silently loses history/stats/persist for this
        // play — surface it.
        getLogger().warn(`[Player] Shadow-pin failed for ${track.id}: ${String(error)}`);
      });
    }

    const copyResult = await offlineCopyRepository.findById(track.id);
    const copy = copyResult.isOk() ? copyResult.value : undefined;
    if (copy) {
      const result = await storageService.getAudioUrl(copy.storagePath);
      if (result.isErr()) throw result.error;
      return result.value;
    }

    const streamResult = await sources.forTrack(track.id).resolveStreamUrl(track.id);
    if (streamResult.isErr()) {
      throw new Error(`[${streamResult.error.kind}] ${streamResult.error.message}`);
    }
    return streamResult.value;
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

  const loadUrl = async (p: Player, url: string, allowCorsFallback = false) => {
    const isHls = url.includes(".m3u8")
      || url.includes("application/vnd.apple.mpegurl");

    if (isHls) {
      await p.load({ url, type: "hls" });
    }
    else if (allowCorsFallback) {
      // Ephemeral direct URLs (radio) may lack ACAO headers; a routed load
      // (crossOrigin=anonymous) would fail outright. Retry un-routed on a media
      // error — EQ/fades/normalization drop for the track, but it plays.
      await p.load(url, { corsFallback: true });
    }
    else {
      await p.load(url);
    }

    // The HTML media load algorithm resets the element's playbackRate to
    // defaultPlaybackRate (1) on every load(), clobbering the rate lyra-audio
    // applies before assigning src. Re-apply it now that media is loaded so a
    // persisted/non-default rate survives fresh loads (e.g. after a reload).
    p.setPlaybackRate(playbackRate.value);
  };

  const play = async () => {
    if (!player.value || !player.value.isReady) {
      const track = currentTrack.value;
      if (!track) return;

      const requestId = ++_playRequestId;

      const url = await resolvePlayback(track);
      if (requestId !== _playRequestId) return;
      if (!url) {
        clearCurrentTrack();
        status.value = "idle";
        return;
      }

      const p = ensurePlayer();
      await loadUrl(p, url, isEphemeralTrack(track) && track.source.type === "url");
      // A newer play request took over while we were loading.
      if (requestId !== _playRequestId) return;
      if (currentTime.value > 0) p.seek(currentTime.value);
      await p.play();
      useAudioSettingsStore().pushToGraph();
      return;
    }

    const wasCancellingFade = _activeFadeAbort !== null;
    cancelActiveFade();

    const audioSettings = useAudioSettingsStore();
    const shouldFade = audioSettings.isFadeEnabled && audioSettings.fadeInDuration > 0;

    if (wasCancellingFade && player.value.isPlaying) {
      // A fade-out-to-pause was interrupted; playback never actually stopped.
      // pause() optimistically set status to "paused"; the deferred pause was
      // aborted, so the player is still playing — restore the store status
      // (direct play(), e.g. MediaSession, bypasses togglePlay's own restore).
      status.value = "playing";
      if (shouldFade) {
        // Ramp the fade multiplier from its mid-fade value back to full.
        // fadeTo() cancels the in-flight fade-out internally — an explicit
        // cancelFade() first would snap to full and kill the ramp.
        await player.value.fadeTo(1, audioSettings.fadeInDuration);
      }
      else {
        // No fade-in: stop the in-flight fade-out, restore the multiplier to
        // full, keep the user's volume (volume no longer touches the fade).
        player.value.cancelFade();
        player.value.setVolume(volume.value);
      }
      return;
    }

    if (shouldFade) {
      await player.value.fadeIn(audioSettings.fadeInDuration);
    }
    else {
      // A prior fade-out-to-pause may have left the fade multiplier at 0.
      // Restore it now, while still paused (no signal), so playback is audible
      // without a click from ramping gain up over still-flushing audio.
      await player.value.fadeTo(1, 0);
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
        // Leave the multiplier at 0 here; play() restores it while paused, so
        // the gain never jumps up over samples the element is still flushing.
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

    const requestId = ++_playRequestId;

    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync();
    }

    cancelActiveFade();
    currentTime.value = 0;
    duration.value = 0;
    // Optimistic: the engine's own statechange only fires once load() starts,
    // leaving the previous track's status (and a false live-stream reading
    // from the zeroed duration) visible while the source URL resolves.
    status.value = "loading";

    const p = ensurePlayer();
    currentTrack.value = track;
    trackChangedBus.emit(track);

    const url = await resolvePlayback(track);
    // A newer play request took over while we resolved the source.
    if (requestId !== _playRequestId) return;
    if (!url) {
      status.value = "error";
      discardPlayer();
      clearCurrentTrack();
      throw new Error(`Cannot resolve audio source for: "${track.title}"`);
    }

    try {
      if (isEphemeralTrack(track) && track.source.type === "file") {
        await p.load(track.source.file);
        // load() resets the element's playbackRate to 1; re-apply (see loadUrl).
        p.setPlaybackRate(playbackRate.value);
      }
      else {
        await loadUrl(p, url, isEphemeralTrack(track) && track.source.type === "url");
      }

      // A superseded load() resolves silently (lyra cancels it internally);
      // playing now would fight the newer request.
      if (requestId !== _playRequestId) return;

      applyLoudnessMetadata(p, track);
      await play();
      useAudioSettingsStore().pushToGraph();
    }
    catch (err) {
      // Errors from a superseded request belong to it alone — swallowing
      // them keeps queue.store from skipping to the next track.
      if (requestId !== _playRequestId) return;
      status.value = "error";
      discardPlayer();
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
    // Claim the token so any in-flight play request aborts instead of
    // resurrecting playback after teardown.
    _playRequestId++;
    cancelActiveFade();
    cancelSleepTimer();
    clearCurrentTrack();
    const oldPlayer = player.value;
    player.value = null;
    if (oldPlayer) await oldPlayer.dispose();
  };

  const getAudioGraph = () => player.value?.graph ?? null;

  const unlockAudio = async () => {
    await ensurePlayer().unlockAudio();
  };

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
    showLoadingIndicator,
    repeatMode,
    currentTrack,
    graphRevision,
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
