import { Player, type PlayerState, type LoudnessMetadata } from "lyra-audio";
import Hls from "hls.js";
import { markRaw } from "vue";
import type { PlaybackSource } from "../service/playback-resolver.service";

/**
 * Store-facing view of the lyra engine's events. Each callback fires only
 * while the engine that produced it is still the live one — a disposed
 * instance (dispose(), load-error recovery) never reaches the store, so the
 * store does not have to compare instances in every handler.
 */
export interface PlaybackEngineHandlers {
  onStateChange: (to: PlayerState) => void;
  /** The engine emits `pause` without moving its own state machine — see the store. */
  onPause: () => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number) => void;
  /** Both `seeking` (clamped target) and `seeked` (landed position). */
  onSeek: (position: number) => void;
  /** `durationchange` and `loadedmetadata`. */
  onDuration: (duration: number) => void;
  /** The media can start; the audio graph is (re)built at this point. */
  onCanPlay: (duration: number) => void;
  onVolume: (volume: number, muted: boolean) => void;
  onRate: (rate: number) => void;
  onError: (detail: string) => void;
}

export interface PlaybackEngineOptions {
  volume: number;
  muted: boolean;
  playbackRate: number;
  loudnessNormalization: {
    enabled: boolean;
    targetLufs: number;
    preventClipping: boolean;
  };
  handlers: PlaybackEngineHandlers;
}

export interface PlaybackEngine {
  /** The raw lyra instance, for consumers that drive the audio graph directly (EQ, normalization). */
  readonly player: Player;
  readonly isReady: boolean;
  readonly isPlaying: boolean;
  readonly isLive: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly graph: Player["graph"];
  load: (source: PlaybackSource) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  seekPercent: (fraction: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  fadeIn: (durationSec: number) => Promise<void>;
  fadeOut: (durationSec: number) => Promise<void>;
  fadeTo: (volume: number, durationSec: number) => Promise<void>;
  cancelFade: () => void;
  setLoudnessMetadata: (metadata: LoudnessMetadata) => void;
  clearLoudnessMetadata: () => void;
  unlockAudio: () => Promise<void>;
  dispose: () => Promise<void>;
}

const describeError = (err: unknown): string => {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  try {
    return JSON.stringify(err);
  }
  catch {
    return String(err);
  }
};

export const createPlaybackEngine = (options: PlaybackEngineOptions): PlaybackEngine => {
  const { handlers } = options;
  let playbackRate = options.playbackRate;
  let disposed = false;

  const player = markRaw(new Player({
    mode: "html5",
    Hls,
    playbackRate,
    latencyHint: "playback",
    loudnessNormalization: options.loudnessNormalization,
  }));

  player.setVolume(options.volume);
  player.setMuted(options.muted);
  player.setPlaybackRate(playbackRate);

  // `live` drops events from an instance that has been disposed and replaced:
  // they would otherwise mutate state that now belongs to its successor.
  const live = <T extends unknown[]>(fn: (...args: T) => void) => (...args: T) => {
    if (!disposed) fn(...args);
  };

  player.on("statechange", live(({ to }) => handlers.onStateChange(to)));
  player.on("pause", live(() => handlers.onPause()));
  player.on("ended", live(() => handlers.onEnded()));
  player.on("timeupdate", live(({ currentTime }) => handlers.onTimeUpdate(currentTime)));
  player.on("seeking", live(t => handlers.onSeek(t)));
  player.on("seeked", live(t => handlers.onSeek(t)));
  player.on("durationchange", live(dur => handlers.onDuration(dur)));
  player.on("loadedmetadata", live(({ duration }) => handlers.onDuration(duration)));
  player.on("canplay", live(() => handlers.onCanPlay(player.duration)));
  player.on("volumechange", live(({ volume, muted }) => handlers.onVolume(volume, muted)));
  player.on("ratechange", live(rate => handlers.onRate(rate)));
  player.on("error", live(err => handlers.onError(describeError(err))));

  const load = async (source: PlaybackSource) => {
    switch (source.kind) {
      case "file":
        await player.load(source.file);
        break;
      case "hls":
        await player.load({ url: source.url, type: "hls" });
        break;
      case "url":
        if (source.corsFallback) await player.load(source.url, { corsFallback: true });
        else await player.load(source.url);
        break;
    }
    // load() resets the element's playbackRate to 1; re-apply the rate the
    // store last asked for, or a persisted 1.5x plays at 1x after a reload.
    player.setPlaybackRate(playbackRate);
  };

  return {
    player,
    get isReady() { return player.isReady; },
    get isPlaying() { return player.isPlaying; },
    get isLive() { return player.isLive; },
    get currentTime() { return player.currentTime; },
    get duration() { return player.duration; },
    get graph() { return player.graph; },
    load,
    play: () => player.play(),
    pause: () => player.pause(),
    stop: () => player.stop(),
    seek: seconds => player.seek(seconds),
    seekPercent: fraction => player.seekPercent(fraction),
    setVolume: volume => player.setVolume(volume),
    setMuted: muted => player.setMuted(muted),
    toggleMute: () => player.toggleMute(),
    setPlaybackRate: (rate) => {
      playbackRate = rate;
      player.setPlaybackRate(rate);
    },
    fadeIn: durationSec => player.fadeIn(durationSec),
    fadeOut: durationSec => player.fadeOut(durationSec),
    fadeTo: (volume, durationSec) => player.fadeTo(volume, durationSec),
    cancelFade: () => player.cancelFade(),
    setLoudnessMetadata: metadata => player.setLoudnessMetadata(metadata),
    clearLoudnessMetadata: () => player.clearLoudnessMetadata(),
    unlockAudio: () => player.unlockAudio(),
    dispose: () => {
      disposed = true;
      return player.dispose();
    },
  };
};
