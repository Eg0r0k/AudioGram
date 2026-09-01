import { getLogger } from "@/lib/logger";
import type { PlaybackEngine } from "./playback-engine";
import { type PlaybackStatus, isAudible } from "./playback-status";

export interface FadeSettings {
  enabled: boolean;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface FadeControllerDeps {
  engine: () => PlaybackEngine | null;
  state: () => PlaybackStatus;
  setState: (next: PlaybackStatus) => void;
  settings: () => FadeSettings;
  /** The user's volume, restored whenever a fade multiplier is snapped back to full. */
  volume: () => number;
  /** A stop actually reached the engine (immediately, or after its fade-out). */
  onStopped: () => void;
}

export interface FadeController {
  /**
   * Starts (or resumes) playback on an engine that already holds this
   * track's media, ramping in when fades are enabled. Handles the case where
   * a fade-out was still in flight.
   */
  start: () => Promise<void>;
  /** Pauses, ramping out first when fades are enabled. The caller has checked the store is playing. */
  pause: () => void;
  /** Stops, ramping out first when fades are enabled and the engine is audible. */
  stop: () => void;
  /** Abandons a fade-out in flight and keeps playing. Returns false when no fade was in flight. */
  interrupt: () => boolean;
  /** Completes a fade-out's deferred pause right now, ahead of a seek. */
  settleBeforeSeek: () => void;
  /**
   * Silences the OUTGOING track the moment a switch begins: the resolve of a
   * remote source takes seconds, and until load() replaces the media the old
   * audio would keep playing under the new track's card. Ramps out when
   * fades are enabled; the deferred pause lands only while `stillSwitching`
   * holds, so a load that finishes inside the ramp is not paused by it.
   */
  silenceForSwitch: (stillSwitching: () => boolean) => void;
}

/**
 * Everything the store does with the `fadingOut` state lives here: the
 * deferred pause/stop a fade-out ends in, and the three ways that fade can
 * be interrupted (play, togglePlay, seek). Transitions still go through the
 * store's setState, which is what aborts a fade-out's deferred action
 * whenever the state leaves `fadingOut` by any other path.
 */
export const createFadeController = (deps: FadeControllerDeps): FadeController => {
  const fadeOutThen = (then: "pause" | "stop", durationSec: number) => {
    const e = deps.engine();
    if (!e) return;
    const ac = new AbortController();
    // Optimistic: the UI reads paused/stopped now; the engine keeps playing
    // until the fade ends and the deferred action lands.
    deps.setState({ kind: "fadingOut", abort: ac, then });
    e.fadeOut(durationSec).then(() => {
      if (ac.signal.aborted) return;
      // Leave the fade first so the engine's own transition lands on a state
      // that accepts it. Leave the multiplier at 0 after a pause; start()
      // restores it while paused, so the gain never jumps up over samples
      // the element is still flushing.
      if (then === "pause") {
        deps.setState({ kind: "paused" });
        deps.engine()?.pause();
      }
      else {
        deps.setState({ kind: "ready" });
        deps.engine()?.stop();
        deps.onStopped();
      }
    })
      // A fade that cannot finish leaves the deferred pause/stop undone —
      // exactly what happens today, minus the unhandled rejection.
      .catch(error => getLogger().warn(`[Player] Fade-out to ${then} failed: ${String(error)}`));
  };

  const start = async () => {
    const e = deps.engine();
    if (!e) return;
    const settings = deps.settings();
    const shouldFade = settings.enabled && settings.fadeInSec > 0;

    if (deps.state().kind === "fadingOut") {
      if (e.isPlaying) {
        // A fade-out was interrupted; playback never actually stopped. The
        // transition aborts the deferred pause/stop, so restore the playing
        // status here (direct play(), e.g. MediaSession, bypasses togglePlay's
        // own restore).
        deps.setState({ kind: "playing" });
        if (shouldFade) {
          // Ramp the fade multiplier from its mid-fade value back to full.
          // fadeTo() cancels the in-flight fade-out internally — an explicit
          // cancelFade() first would snap to full and kill the ramp.
          await e.fadeTo(1, settings.fadeInSec);
        }
        else {
          // No fade-in: stop the in-flight fade-out, restore the multiplier to
          // full, keep the user's volume (volume no longer touches the fade).
          e.cancelFade();
          e.setVolume(deps.volume());
        }
        return;
      }
      // The platform stopped the element under the fade: the deferred action
      // is moot, start over like any paused player.
      deps.setState({ kind: "paused" });
    }

    if (shouldFade) {
      await e.fadeIn(settings.fadeInSec);
    }
    else {
      // A prior fade-out-to-pause may have left the fade multiplier at 0.
      // Restore it now, while still paused (no signal), so playback is audible
      // without a click from ramping gain up over still-flushing audio.
      await e.fadeTo(1, 0);
      e.setVolume(deps.volume());
      await e.play();
    }
  };

  const pause = () => {
    const e = deps.engine();
    if (!e) return;
    const settings = deps.settings();
    if (settings.enabled && settings.fadeOutSec > 0) fadeOutThen("pause", settings.fadeOutSec);
    else e.pause();
  };

  const stop = () => {
    const e = deps.engine();
    if (!e) return;
    const settings = deps.settings();
    // Only audible playback has anything to fade; a paused or idle engine
    // stops right away. An interrupted fade-out-to-pause continues ramping
    // from wherever its multiplier is.
    if (settings.enabled && settings.fadeOutSec > 0 && isAudible(deps.state())) {
      fadeOutThen("stop", settings.fadeOutSec);
    }
    else {
      e.stop();
      deps.onStopped();
    }
  };

  const interrupt = () => {
    if (deps.state().kind !== "fadingOut") return false;
    // Interrupting a fade-out keeps playing: the transition aborts the
    // deferred pause/stop, then the multiplier snaps back to full.
    deps.setState({ kind: "playing" });
    deps.engine()?.cancelFade();
    deps.engine()?.setVolume(deps.volume());
    return true;
  };

  // A fade-out-to-pause/stop in flight means the UI already shows "paused"
  // but only the fade's deferred engine pause would make it real — and that
  // pause is abort-guarded. Seeking must complete the pause instead of
  // abandoning it, or the element keeps playing silently at gain 0 and later
  // "ends" into the next track at full volume. Order matters: pause first,
  // because cancelFade snaps the multiplier back to full and would pop over
  // still-playing audio.
  const settleBeforeSeek = () => {
    if (deps.state().kind !== "fadingOut") return;
    deps.setState({ kind: "paused" });
    deps.engine()?.pause();
    deps.engine()?.cancelFade();
  };

  const silenceForSwitch = (stillSwitching: () => boolean) => {
    const e = deps.engine();
    if (!e?.isPlaying) return;
    const settings = deps.settings();
    if (!settings.enabled || settings.fadeOutSec <= 0) {
      e.pause();
      return;
    }
    // No state transition: the store already reads "resolving" for the new
    // track, and the engine's own events are dropped for the whole switch.
    e.fadeOut(settings.fadeOutSec)
      .then(() => {
        if (stillSwitching()) deps.engine()?.pause();
      })
      .catch(error => getLogger().warn(`[Player] Fade-out before a switch failed: ${String(error)}`));
  };

  return { start, pause, stop, interrupt, settleBeforeSeek, silenceForSwitch };
};
