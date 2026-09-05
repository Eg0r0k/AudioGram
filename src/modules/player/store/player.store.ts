import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type { PlayerState } from "lyra-audio";
import { useAudioSettingsStore } from "@/modules/settings/store/audio";
import {
  type PlayerTrack,
  isLibraryTrack,
} from "../types";
import { statsService } from "@/services/stats.service";
import { useEventBus } from "@vueuse/core";
import { trackChangedEvent, trackEndedEvent } from "../lib/player-events";
import { createListenSession } from "../lib/listen-session";
import { createPlaybackEngine, type PlaybackEngine } from "../lib/playback-engine";
import { createFadeController } from "../lib/fade-controller";
import { useDelayedIndicator } from "../composables/useDelayedIndicator";
import { useCountdown } from "../composables/useCountdown";
import { getLogger } from "@/lib/logger";
import { createDebouncedLocalStorage } from "@/lib/storage/debounced-storage";
import {
  type PlaybackSource,
  PlaybackFailure,
  toPlaybackFailure,
  isRetryablePlaybackError,
  isEngineFailure,
  checkPlayable,
  isStreamingTrack,
  resolvePlaybackSource,
  resolveTimeoutMsFor,
} from "../service/playback-resolver.service";
import {
  type PlaybackStatus,
  isSwitching as isSwitchingStatus,
  isPlayingStatus,
  isLoadingStatus,
  toPlayerState,
  fromPlayerState,
  assertPlaybackInvariant,
} from "../lib/playback-status";

export const usePlayerStore = defineStore("player", () => {
  const engine = shallowRef<PlaybackEngine | null>(null);
  // The raw lyra instance, for consumers that drive the audio graph directly
  // (EQ, normalization, progress polling). Everything else goes through the
  // engine adapter.
  const player = computed(() => engine.value?.player ?? null);

  const trackChangedBus = useEventBus(trackChangedEvent);
  const trackEndedBus = useEventBus(trackEndedEvent);

  const currentTime = ref(0);
  // null until the loaded media reports its length — a track switch, a
  // restored session before its first play(). Readers that need a number
  // for arithmetic coalesce it themselves; nobody has to guess whether a
  // zero means "unknown".
  const duration = ref<number | null>(null);
  const volume = ref(1);
  const isMuted = ref(false);
  const playbackRate = ref(1);
  // The track the UI shows: what playPlayerTrack() is loading or has loaded,
  // or what the queue told the player to present without loading (a restored
  // session before its first play(), a metadata edit, an imported ephemeral).
  // Not persisted: the queue owns the current track across sessions and
  // presents it back on restore. The queue is the only writer besides
  // playPlayerTrack; this store never reads the queue.
  const currentTrack = ref<PlayerTrack | null>(null);
  const graphRevision = ref(0);

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
  // The engine's media belongs to `currentTrack`: set once a load for the
  // live request resolves, cleared whenever that stops being true (a new
  // switch, a cancelled or failed load, a discarded engine). lyra's isReady
  // alone cannot tell — after a cancelled load the element is "ready" with
  // media nobody armed a session for.
  let _mediaLoaded = false;
  // `currentTrack` has been announced over trackChanged. A restored session
  // is presented without an announcement, so its first play() must make one
  // for the stats session to exist.
  let _trackAnnounced = false;

  const announceTrack = (track: PlayerTrack | null) => {
    _trackAnnounced = track !== null;
    trackChangedBus.emit(track);
  };

  // Abandons whatever play request is in flight: a stale attempt waking up
  // after its await sees a newer token and returns without touching the
  // engine. Media loaded for the abandoned request is not this track's.
  const invalidatePlayRequest = () => {
    _playRequestId++;
    _mediaLoaded = false;
  };

  // The one place the player's state lives — see playback-status.ts for the
  // variants. shallowRef: the fadingOut variant carries an AbortController
  // that must not be wrapped in a reactive proxy; every transition replaces
  // the whole object.
  const state = shallowRef<PlaybackStatus>({ kind: "idle" });

  // The single transition point. Leaving a fade-out through any path other
  // than its own deferred action aborts that action — otherwise the element
  // keeps playing silently at gain 0 and later "ends" into the next track at
  // full volume. (The completing action re-aborts its own controller, which
  // is harmless: it has already passed the aborted check.) A switch may only
  // be opened for the request that currently owns the token.
  const setState = (next: PlaybackStatus) => {
    const prev = state.value;
    if (prev.kind === "fadingOut" && prev !== next) prev.abort.abort();
    if (next.kind === "resolving" || next.kind === "loading") {
      assertPlaybackInvariant(
        next.requestId === _playRequestId,
        `${next.kind} opened for request ${next.requestId}, current is ${_playRequestId}`,
      );
    }
    state.value = next;
  };

  // While this holds, the engine still carries the PREVIOUS track's media:
  // its load() chatter and its ended/timeupdate belong to the outgoing track.
  const isSwitchingTrack = () => isSwitchingStatus(state.value, _playRequestId);

  // Fade-in/out policy and the deferred pause/stop a fade-out ends in — see
  // fade-controller.ts. Transitions still go through setState above.
  const fades = createFadeController({
    engine: () => engine.value,
    state: () => state.value,
    setState,
    settings: () => {
      const audioSettings = useAudioSettingsStore();
      return {
        enabled: audioSettings.isFadeEnabled,
        fadeInSec: audioSettings.fadeInDuration,
        fadeOutSec: audioSettings.fadeOutDuration,
      };
    },
    volume: () => volume.value,
    onStopped: () => {
      currentTime.value = 0;
    },
  });

  // Flat lyra-shaped view for consumers that predate the union.
  const status = computed<PlayerState>(() => toPlayerState(state.value));
  // The union itself. Exposed as store state (writable, as Pinia state is)
  // so tests can seed a scenario; production code transitions through the
  // actions only, never by assigning here.
  const playbackState = state;

  const isPlaying = computed(() => isPlayingStatus(state.value));
  // What transport controls outside the app (media session, notification,
  // taskbar toolbar) should show. A track switch passes through "loading"
  // on its way to play() — every "loading" here ends in playback — and
  // reporting that gap as "paused" makes the play/pause button flicker on
  // each skip. The in-app button keeps using `isPlaying` + its own loader.
  const isPlaybackIntended = computed(
    () => isPlaying.value || isLoadingStatus(state.value),
  );
  const isLoading = computed(() => isLoadingStatus(state.value));

  // Local tracks (OPFS/FS) load in tens of milliseconds, so a spinner bound
  // directly to `isLoading` would flash on every start; the delayed indicator
  // only shows up for real waits (slow disk, remote streams, HLS buffering).
  const showLoadingIndicator = useDelayedIndicator(isLoading);

  const progress = computed(() => {
    const dur = duration.value;
    if (dur === null || dur <= 0) return 0;
    return (currentTime.value / dur) * 100;
  });

  const canPlay = computed(() => engine.value?.isReady ?? false);

  const isLiveStream = computed(() => {
    const track = currentTrack.value;
    if (!track) return false;
    const dur = duration.value;
    if (engine.value?.isLive) return true;
    // Unknown is not endless: only a loaded stream that reports no length.
    if (dur === null) return false;
    return isStreamingTrack(track) && dur <= 0;
  });

  const canSeek = computed(() => {
    if (!engine.value) return false;
    if (isLiveStream.value) return false;
    return duration.value !== null && duration.value > 0;
  });

  // See listen-session.ts for the accounting model (engine-clock deltas,
  // armed-after-load contract).
  const listenSession = createListenSession();
  const getListenedSeconds = () => listenSession.seconds();

  const stopListeningAndSync = (options: { completed?: boolean; skipped?: boolean } = {}) => {
    // Pull the element position right now: in the background the last
    // timeupdate may be minutes stale, and the engine clock is the only
    // source that never throttles.
    if (engine.value) listenSession.sample(engine.value.currentTime);
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
    // A play still in flight would otherwise finish loading and start the
    // audio under an empty UI. Clearing mid-switch also releases the event
    // filter: whatever the engine does next has to reach the store again.
    if (isLoadingStatus(state.value)) {
      invalidatePlayRequest();
      setState({ kind: "idle" });
    }
    _mediaLoaded = false;
    currentTrack.value = null;
    currentTime.value = 0;
    duration.value = null;
    announceTrack(null);
  };

  const discardEngine = () => {
    const broken = engine.value;
    engine.value = null;
    _mediaLoaded = false;
    broken?.dispose().catch(() => {});
  };

  /**
   * Returns the app-lifetime engine, creating it on first use. Tracks reuse
   * the same engine: lyra's load() tears down the previous source itself and
   * cancels a superseded in-flight load internally, so recreating the
   * instance per track is unnecessary (and was the root of orphaned-player
   * races). A new instance appears only after dispose() or a load error.
   * The adapter drops events from a disposed-then-replaced instance, so the
   * handlers below only ever hear from the live one.
   */
  const ensureEngine = (): PlaybackEngine => {
    if (engine.value) return engine.value;

    const audioSettings = useAudioSettingsStore();
    const created = createPlaybackEngine({
      volume: volume.value,
      muted: isMuted.value,
      playbackRate: playbackRate.value,
      loudnessNormalization: {
        enabled: audioSettings.isNormalizationEnabled,
        targetLufs: audioSettings.normalizationTargetLufs,
        preventClipping: audioSettings.normalizationPreventClipping,
      },
      handlers: {
        onStateChange: (to) => {
          // Mid-switch every transition but the load's own progress is the
          // OUTGOING track's media: load() resets to "idle" and resolves through
          // "ready" before play() lands, and a stall of the old audio reads as
          // "buffering". None of that may reach the UI — a single frame of "not
          // playing" visibly re-morphs the pause icon, and leaving the window on
          // a blip would let the old track's ended/timeupdate through.
          if (isSwitchingTrack() && to !== "loading" && to !== "error") return;
          // A fade-out owns its exit: playing/buffering blips while the ramp runs
          // are the very audio being silenced. A stop, an end or a failure of
          // that audio still lands and abandons the fade.
          if (state.value.kind === "fadingOut" && (to === "playing" || to === "buffering")) return;
          setState(fromPlayerState(to, _playRequestId));
        },
        // The engine emits `pause` without moving its own state machine, so a
        // pause it did not initiate never reaches `status` through statechange.
        // The platform does initiate them — audio focus loss, a call, Chromium
        // pausing a hidden element — and the UI then goes on claiming it is
        // playing over a silent element, with the position frozen. lyra already
        // filters the pause that accompanies `ended`.
        onPause: () => {
          // Mid-switch the engine still holds the OUTGOING track's media.
          if (isSwitchingTrack()) return;
          // A fade-out-to-pause already reports "paused" and its deferred action
          // still lands; anything else that is nominally playing has just been
          // overruled.
          if (isPlayingStatus(state.value)) setState({ kind: "paused" });
        },
        onEnded: () => {
          // Mid-switch the engine still holds the OUTGOING track's media: its
          // natural end must not advance the queue past the user's own selection.
          // The cut-short session was already finalized by playPlayerTrack.
          if (isSwitchingTrack()) return;
          // A natural end means the element reached its duration: credit the
          // sliver past the last sample BEFORE the UI reset below, because the
          // lifecycle's completed-stop runs off this emit and must see the full
          // session (reading the zeroed time recorded every natural end as
          // 0 seconds listened and never bumped playCount).
          if (duration.value !== null && duration.value > 0) listenSession.sample(duration.value);
          currentTime.value = 0;
          listenSession.rebase(0);
          trackEndedBus.emit();
        },
        onTimeUpdate: (t) => {
          // Positions arriving mid-switch are the outgoing track's audio: they
          // must not overwrite the optimistic zeroed position (the un-armed
          // session drops the samples anyway).
          if (isSwitchingTrack()) return;
          listenSession.sample(t);
          currentTime.value = t;
        },
        // Re-bases without crediting: "seeking" fires synchronously with the
        // clamped target (covers every initiator — slider, chapters, media
        // session), "seeked" re-syncs to the position the element actually
        // landed on.
        onSeek: t => listenSession.rebase(t),
        onDuration: (dur) => {
          duration.value = dur;
        },
        onCanPlay: (dur) => {
          duration.value = dur;
          graphRevision.value++;
        },
        onVolume: (vol, muted) => {
          volume.value = vol;
          isMuted.value = muted;
        },
        onRate: (rate) => {
          playbackRate.value = rate;
        },
        onError: detail => getLogger().error(`[Player] error: ${detail}`),
      },
    });

    engine.value = created;
    return created;
  };

  const applyLoudnessMetadata = (e: PlaybackEngine, track: PlayerTrack) => {
    if (isLibraryTrack(track) && typeof track.integratedLufs === "number") {
      e.setLoudnessMetadata({
        integratedLufs: track.integratedLufs,
        truePeakDbtp: track.truePeakDbtp,
      });
    }
    else {
      e.clearLoudnessMetadata();
    }
  };

  const throwIfUnplayable = (track: PlayerTrack) => {
    const playable = checkPlayable(track);
    if (playable.isErr()) throw new PlaybackFailure(playable.error, track);
  };

  // Watchdog: no await on the way to playback may hang forever. In a hidden
  // Android WebView the ended → next → resolve → load chain can stall on any
  // of them, and a store that then honestly reports "loading" for the rest
  // of the session is worse than a skipped track. Starting values — tune
  // against real devices; streams get a longer leash than local files, and
  // the resolve deadline depends on the source (see resolveTimeoutMsFor).
  const LOAD_TIMEOUT_MS = 30_000;
  const HLS_LOAD_TIMEOUT_MS = 60_000;

  const loadTimeoutFor = (source: PlaybackSource) =>
    source.kind === "hls" ? HLS_LOAD_TIMEOUT_MS : LOAD_TIMEOUT_MS;

  // Races `work` against a deadline. A late settlement of `work` after the
  // deadline is dropped, not acted on; cancelling the underlying engine work
  // is the caller's job (disposing the engine does it). A plain timer rather
  // than AbortSignal.timeout: lyra's load() accepts no signal, so a signal
  // would only be a timer in disguise — and this one fake timers can drive.
  const withTimeout = <T>(work: PromiseLike<T>, ms: number, onTimeout: () => Error): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const deadline = setTimeout(() => reject(onTimeout()), ms);
      Promise.resolve(work)
        .then(resolve, reject)
        .finally(() => clearTimeout(deadline));
    });

  /**
   * The one path from a track to audible playback: claim a request, resolve
   * the source, load it, start. Used both for a track switch and for a cold
   * start (a session restored after reload, or a switch interrupted mid-load).
   * A transient failure gets one retry on a fresh engine; then the store
   * settles into "error" and the failure is thrown.
   */
  const loadAndPlay = async (track: PlayerTrack, options: { resumeAt?: number } = {}) => {
    const requestId = ++_playRequestId;
    // Optimistic: the engine's own statechange only fires once load() starts,
    // leaving the previous track's status (and a false live-stream reading
    // from the zeroed duration) visible while the source URL resolves.
    // Opening the switch also abandons any fade in flight.
    setState({ kind: "resolving", requestId });
    // The engine still holds the previous track and would play it audibly
    // until load() lands — seconds, for a remote resolve.
    fades.silenceForSwitch(() => requestId === _playRequestId && isSwitchingTrack());

    for (let retry = 0; ; retry++) {
      try {
        await attemptLoadAndPlay(track, requestId, options);
        return;
      }
      catch (err) {
        if (requestId !== _playRequestId) return;
        const failure = toPlaybackFailure(err, track);
        _mediaLoaded = false;
        // Only a load that failed or hung says anything about the engine;
        // recreating it costs a new AudioContext (suspended until a user
        // gesture on some platforms) and a rebuilt EQ graph. A source that
        // could not be resolved leaves a healthy engine that still holds the
        // OUTGOING track's media — silence that rather than let it play on
        // under an error screen.
        if (isEngineFailure(failure.error)) discardEngine();
        else engine.value?.stop();
        if (retry < 1 && isRetryablePlaybackError(failure.error)) {
          getLogger().warn(`[Player] Retrying "${track.title}" after a ${failure.error.kind} failure`);
          setState({ kind: "resolving", requestId });
          continue;
        }
        setState({ kind: "error" });
        // A source that cannot be resolved at all, or a file that is gone, is
        // not worth keeping on screen; other failures keep the track so the UI
        // can show what failed.
        if (failure.error.kind === "unavailable" || failure.error.kind === "storage") {
          clearCurrentTrack();
        }
        throw failure;
      }
    }
  };

  const attemptLoadAndPlay = async (
    track: PlayerTrack,
    requestId: number,
    options: { resumeAt?: number },
  ) => {
    const e = ensureEngine();

    {
      const resolved = await withTimeout(
        resolvePlaybackSource(track),
        resolveTimeoutMsFor(track),
        () => new PlaybackFailure({ kind: "timeout", phase: "resolving" }, track),
      );
      if (requestId !== _playRequestId) return;
      if (resolved.isErr()) throw new PlaybackFailure(resolved.error, track);

      setState({ kind: "loading", requestId });
      await withTimeout(
        e.load(resolved.value),
        loadTimeoutFor(resolved.value),
        () => new PlaybackFailure({ kind: "timeout", phase: "loading" }, track),
      );

      // A superseded load() resolves silently (lyra cancels it internally);
      // playing now would fight the newer request.
      if (requestId !== _playRequestId) return;

      // Only now is this track the engine's media — positions sampled before
      // this point still belonged to the previous track.
      _mediaLoaded = true;
      listenSession.arm();
      applyLoudnessMetadata(e, track);
      // The loaded media belongs to THIS track now, so the switching window
      // must close before play(): with fade-in enabled play() resolves only
      // after the entire fade, and a track shorter than the fade genuinely
      // ends inside it — that ended must advance the queue, not be dropped
      // as stale.
      setState({ kind: "starting" });
      if (options.resumeAt && options.resumeAt > 0) e.seek(options.resumeAt);
      await fades.start();
      useAudioSettingsStore().pushToGraph();
    }
  };

  const play = async () => {
    if (engine.value?.isReady && _mediaLoaded) {
      await fades.start();
      return;
    }
    // No media for this track in the engine: a session restored after
    // reload, a load that togglePlay cancelled, a failed attempt. Start the
    // current track from where it was; a failure is logged, not thrown — the
    // callers here are UI handlers, and the store already reads "error".
    const track = currentTrack.value;
    if (!track) return;
    try {
      throwIfUnplayable(track);
      // A restored track was presented, never announced: the lifecycle has
      // no stats session for it until now.
      if (!_trackAnnounced) announceTrack(track);
      await loadAndPlay(track, { resumeAt: currentTime.value });
    }
    catch (err) {
      getLogger().error(`[Player] Cannot start "${track.title}": ${String(err)}`);
    }
  };

  const pause = () => {
    // A fade-out already in flight is not "playing" — a second pause is a no-op.
    if (!engine.value || !isPlaying.value) return;
    fades.pause();
  };

  // A pause pressed on the spinner. Before the media is loaded there is
  // nothing to pause: the request is abandoned and play() reloads later.
  // Once loaded (the fade-in is running) the element is paused in place and
  // the media stays this track's, so play() resumes without a reload. Either
  // way the interrupted attempt sees a stale token and does not retry.
  const cancelPendingPlay = () => {
    const wasStarting = state.value.kind === "starting";
    _playRequestId++;
    if (wasStarting) {
      engine.value?.pause();
      engine.value?.cancelFade();
    }
    else {
      _mediaLoaded = false;
    }
    setState({ kind: "paused" });
  };

  const togglePlay = async () => {
    if (fades.interrupt()) return;
    if (isLoadingStatus(state.value)) {
      cancelPendingPlay();
      return;
    }
    if (isPlaying.value) pause();
    else await play();
  };

  const stop = () => {
    if (!engine.value) return;
    // A play still in flight must not come back to life after the stop:
    // abandon it, and release the event filter so the engine's next
    // transition reaches the store again.
    if (isLoadingStatus(state.value)) {
      invalidatePlayRequest();
      setState({ kind: "idle" });
    }
    fades.stop();
  };

  /**
   * Main entry point for playing any track.
   * Throws a PlaybackFailure on failure — queue.store uses this to skip to
   * next, and the failure's `error.kind` says whether that is the right move.
   */
  const playPlayerTrack = async (track: PlayerTrack): Promise<void> => {
    throwIfUnplayable(track);

    // A pending listen still open at this point means the previous track was
    // cut short by this switch — on a natural end the trackEnded handler has
    // already finalized it as completed and this is a no-op.
    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync({ skipped: true });
    }
    // The consumed session is over; the next one starts at position 0.
    listenSession.reset();

    currentTime.value = 0;
    duration.value = null;
    _mediaLoaded = false;
    currentTrack.value = track;
    announceTrack(track);

    await loadAndPlay(track);
  };

  /**
   * Show `track` as the current one without touching the engine: a restored
   * session before its first play() (play() then loads it from here), a
   * metadata edit to the playing track, or media already in the engine that
   * now belongs to a different track identity (an ephemeral file imported
   * into the library while playing). Playback continues untouched.
   */
  const presentTrack = (track: PlayerTrack) => {
    currentTrack.value = track;
  };

  /**
   * Show `track` as the current one with nothing loaded for it — the queue
   * removed the paused current entry and moved the selection to its
   * successor. Whatever the engine holds is the previous track's: it is
   * stopped and forgotten, and the next play() loads this track. Unlike
   * playPlayerTrack nothing is loaded now, so nothing can fail here.
   */
  const selectTrack = (track: PlayerTrack) => {
    if (isLibraryTrack(currentTrack.value)) {
      stopListeningAndSync({ skipped: true });
    }
    listenSession.reset();
    if (isLoadingStatus(state.value)) invalidatePlayRequest();
    _mediaLoaded = false;
    engine.value?.stop();
    if (state.value.kind !== "idle") setState({ kind: "paused" });
    currentTime.value = 0;
    duration.value = null;
    currentTrack.value = track;
    announceTrack(track);
  };

  /**
   * Plays the current track again from the top on the media the engine
   * already holds — repeat-one after a natural end. A loop is a new listen,
   * so the track is announced again and a fresh session armed. Returns false
   * when the engine holds no media for this track (nothing loaded, a
   * discarded engine); the caller then takes the full load path.
   */
  const restartCurrent = async (): Promise<boolean> => {
    const track = currentTrack.value;
    const e = engine.value;
    if (!track || !e?.isReady || !_mediaLoaded) return false;
    if (isLibraryTrack(track)) stopListeningAndSync();
    listenSession.reset();
    listenSession.arm();
    currentTime.value = 0;
    announceTrack(track);
    e.seek(0);
    await fades.start();
    return true;
  };

  const seekTo = (seconds: number) => {
    if (!canSeek.value) return;
    fades.settleBeforeSeek();
    engine.value?.seek(seconds);
  };

  const seekPercent = (percent: number) => {
    if (!canSeek.value) return;
    fades.settleBeforeSeek();
    engine.value?.seekPercent(percent / 100);
  };

  const setVolume = (value: number) => {
    volume.value = value;
    engine.value?.setVolume(value);
  };

  const setMuted = (muted: boolean) => {
    isMuted.value = muted;
    engine.value?.setMuted(muted);
  };

  const setPlaybackRate = (value: number) => {
    if (!Number.isFinite(value)) return;
    playbackRate.value = Math.min(Math.max(value, 0.0625), 16);
    engine.value?.setPlaybackRate(playbackRate.value);
  };

  const toggleMute = () => {
    engine.value?.toggleMute();
  };

  const dispose = async () => {
    invalidatePlayRequest();
    setState({ kind: "idle" });
    cancelSleepTimer();
    clearCurrentTrack();
    const old = engine.value;
    engine.value = null;
    if (old) await old.dispose();
  };

  const getAudioGraph = () => engine.value?.graph ?? null;

  const unlockAudio = async () => {
    await ensureEngine().unlockAudio();
  };

  return {
    player,
    status,
    playbackState,
    currentTime,
    duration,
    volume,
    isMuted,
    playbackRate,
    isPlaying,
    isPlaybackIntended,
    isLoading,
    showLoadingIndicator,
    currentTrack,
    graphRevision,
    sleepTimerEndsAt,
    sleepTimerRemainingMs,
    isSleepTimerActive,
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
    getAudioGraph,
    getListenedSeconds,
    dispose,
    setMuted,
    setSleepTimer,
    cancelSleepTimer,
    clearCurrentTrack,
    presentTrack,
    selectTrack,
    restartCurrent,
    unlockAudio,
  };
}, {
  persist: {
    key: "lyra-player",
    storage: createDebouncedLocalStorage(500),
    pick: [
      "volume",
      "isMuted",
      "playbackRate",
      "currentTime",
      "sleepTimerEndsAt",
    ],
  },
});
