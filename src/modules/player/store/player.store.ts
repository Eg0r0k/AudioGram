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
import { platformCaps } from "@/lib/environment/platformCaps";
import { storageService } from "@/db/storage";
import { offlineCopyRepository } from "@/db/repositories";
import { sources } from "@/modules/sources";
import { statsService } from "@/services/stats.service";
import { ensurePinned } from "@/modules/tracks/lib/ensurePinned";
import { useEventBus } from "@vueuse/core";
import { trackChangedEvent, trackEndedEvent } from "../lib/player-events";
import { createListenSession } from "../lib/listen-session";
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

  // The _playRequestId of the switch currently in flight, from the optimistic
  // "loading" until that request reaches playback (or fails). While it matches
  // _playRequestId the engine still carries the PREVIOUS track's media: its
  // load() chatter — it resets to "idle" and resolves through "ready" before
  // play() lands — must not reach `status`, and its ended/timeupdate belong to
  // the outgoing track, not the incoming one. Keyed to the request id (not a
  // boolean) so any newer request bumping _playRequestId closes the window
  // even when the superseded switch never gets to clean up after itself.
  let _switchingRequestId: number | null = null;
  const _isSwitchingTrack = () => _switchingRequestId === _playRequestId;

  const isPlaying = computed(
    () => status.value === "playing" || status.value === "buffering",
  );
  // What transport controls outside the app (media session, notification,
  // taskbar toolbar) should show. A track switch passes through "loading"
  // on its way to play() — every "loading" here ends in playback — and
  // reporting that gap as "paused" makes the play/pause button flicker on
  // each skip. The in-app button keeps using `isPlaying` + its own loader.
  const isPlaybackIntended = computed(
    () => isPlaying.value || status.value === "loading",
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

  // See listen-session.ts for the accounting model (engine-clock deltas,
  // armed-after-load contract).
  const listenSession = createListenSession();
  const getListenedSeconds = () => listenSession.seconds();

  const stopListeningAndSync = (options: { completed?: boolean; skipped?: boolean } = {}) => {
    // Pull the element position right now: in the background the last
    // timeupdate may be minutes stale, and the engine clock is the only
    // source that never throttles.
    if (player.value) listenSession.sample(player.value.currentTime);
    statsService.stopListening(listenSession.seconds(), options)
      .catch(err => getLogger().error(`[Stats] ${String(err)}`));
  };

  const clearCurrentTrack = () => {
    // A session can still be open here (dispose, resolve failure): finalize it
    // with real accumulated seconds instead of leaking it to the wall-clock
    // fallback in stats.service.
    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync({ skipped: true });
    }
    listenSession.reset();
    _switchingRequestId = null;
    if (_activeBlobUrl) {
      URL.revokeObjectURL(_activeBlobUrl);
      _activeBlobUrl = null;
    }
    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = 0;
    trackChangedBus.emit(null);
  };

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
      mode: "html5",
      Hls,
      playbackRate: playbackRate.value,
      latencyHint: "playback",
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
      if (player.value !== newPlayer) return;
      if (_isSwitchingTrack() && (to === "idle" || to === "ready" || to === "paused")) return;
      status.value = to;
    });
    // The engine emits `pause` without moving its own state machine, so a
    // pause it did not initiate never reaches `status` through statechange.
    // The platform does initiate them — audio focus loss, a call, Chromium
    // pausing a hidden element — and the UI then goes on claiming it is
    // playing over a silent element, with the position frozen. lyra already
    // filters the pause that accompanies `ended`.
    newPlayer.on("pause", () => {
      if (player.value !== newPlayer) return;
      // Mid-switch the engine still holds the OUTGOING track's media.
      if (_isSwitchingTrack()) return;
      // A fade-out-to-pause has already set "paused" optimistically; anything
      // else that is still nominally playing has just been overruled.
      if (status.value === "playing" || status.value === "buffering") {
        status.value = "paused";
      }
    });
    newPlayer.on("ended", () => {
      if (player.value !== newPlayer) return;
      // Mid-switch the engine still holds the OUTGOING track's media: its
      // natural end must not advance the queue past the user's own selection.
      // The cut-short session was already finalized by playPlayerTrack.
      if (_isSwitchingTrack()) return;
      // A natural end means the element reached its duration: credit the
      // sliver past the last sample BEFORE the UI reset below, because the
      // lifecycle's completed-stop runs off this emit and must see the full
      // session (reading the zeroed time recorded every natural end as
      // 0 seconds listened and never bumped playCount).
      if (duration.value > 0) listenSession.sample(duration.value);
      currentTime.value = 0;
      listenSession.rebase(0);
      trackEndedBus.emit();
    });
    newPlayer.on("timeupdate", ({ currentTime: t }) => {
      if (player.value !== newPlayer) return;
      // Positions arriving mid-switch are the outgoing track's audio: they
      // must not overwrite the optimistic zeroed position (the un-armed
      // session drops the samples anyway).
      if (_isSwitchingTrack()) return;
      listenSession.sample(t);
      currentTime.value = t;
    });
    // Both hooks re-base without crediting: "seeking" fires synchronously with
    // the clamped target (covers every initiator — slider, chapters, media
    // session), "seeked" re-syncs to the position the element actually landed
    // on.
    newPlayer.on("seeking", (t) => {
      if (player.value === newPlayer) listenSession.rebase(t);
    });
    newPlayer.on("seeked", (t) => {
      if (player.value === newPlayer) listenSession.rebase(t);
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
      if (player.value !== newPlayer) return;
      const detail = err instanceof Error
        ? `${err.name}: ${err.message}`
        : (() => {
            try {
              return JSON.stringify(err);
            }
            catch {
              return String(err);
            }
          })();
      getLogger().error(`[Player] error: ${detail}`);
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
        if (!platformCaps.hasFs) {
          getLogger().warn("[Player] path-based ephemeral tracks require native FS");
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
      if (track.source === TrackSource.LOCAL_EXTERNAL && !platformCaps.hasFs) {
        getLogger().warn("[Player] LOCAL_EXTERNAL tracks require native FS");
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
      await p.load(url, { corsFallback: true });
    }
    else {
      await p.load(url);
    }
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
    _switchingRequestId = null;
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
    if (isLibraryTrack(track) && track.state === TrackState.BROKEN) {
      throw new Error(`Track is marked as broken: "${track.title}"`);
    }

    const requestId = ++_playRequestId;

    // A pending listen still open at this point means the previous track was
    // cut short by this switch — on a natural end the trackEnded handler has
    // already finalized it as completed and this is a no-op.
    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync({ skipped: true });
    }
    // The consumed session is over; the next one starts at position 0.
    listenSession.reset();

    cancelActiveFade();
    currentTime.value = 0;
    duration.value = 0;
    // Optimistic: the engine's own statechange only fires once load() starts,
    // leaving the previous track's status (and a false live-stream reading
    // from the zeroed duration) visible while the source URL resolves.
    status.value = "loading";
    _switchingRequestId = requestId;


    const p = ensurePlayer();
    currentTrack.value = track;
    trackChangedBus.emit(track);

    const url = await resolvePlayback(track);
    if (requestId !== _playRequestId) return;
    if (!url) {
      _switchingRequestId = null;
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

      // Only now is this track the engine's media — positions sampled before
      // this point still belonged to the previous track.
      listenSession.arm();
      applyLoudnessMetadata(p, track);
      // The loaded media belongs to THIS track now, so the switching window
      // must close before play(): with fade-in enabled play() resolves only
      // after the entire fade, and a track shorter than the fade genuinely
      // ends inside it — that ended must advance the queue, not be dropped
      // as stale.
      if (_switchingRequestId === requestId) _switchingRequestId = null;
      await play();
      useAudioSettingsStore().pushToGraph();
    }
    catch (err) {
      if (requestId !== _playRequestId) return;
      _switchingRequestId = null;
      status.value = "error";
      discardPlayer();
      if (err instanceof StorageError) {
        clearCurrentTrack();
      }
      throw err;
    }
  };

  // A fade-out-to-pause/stop in flight means the UI already shows "paused"
  // but only the fade's deferred engine pause would make it real — and that
  // pause is abort-guarded. Seeking must complete the pause instead of
  // abandoning it, or the element keeps playing silently at gain 0 and later
  // "ends" into the next track at full volume. Order matters: pause first,
  // because cancelFade snaps the multiplier back to full and would pop over
  // still-playing audio.
  const settleFadeBeforeSeek = () => {
    if (!_activeFadeAbort) return;
    cancelActiveFade();
    player.value?.pause();
    player.value?.cancelFade();
  };

  const seekTo = (seconds: number) => {
    if (!canSeek.value) return;
    settleFadeBeforeSeek();
    player.value?.seek(seconds);
  };

  const seekPercent = (percent: number) => {
    if (!canSeek.value) return;
    settleFadeBeforeSeek();
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
    isPlaybackIntended,
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
    getListenedSeconds,
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
