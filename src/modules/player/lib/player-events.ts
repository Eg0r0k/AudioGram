import type { PlayerTrack } from "../types";

export interface PlayerEventMap {
  /** currentTrack changed: a new track started, or playback was cleared. */
  trackChanged: PlayerTrack | null;
  /** The engine played the current track to its end. */
  trackEnded: void;
}

/**
 * Minimal typed emitter for player lifecycle events. These are moments, not
 * state: encoding them as counter refs loses ordering across watchers and
 * forces every subscriber to track "did I already react to this value".
 * Subscribers register in player-lifecycle.ts, where reaction order is
 * explicit and synchronous.
 */
function createPlayerEmitter() {
  const handlers = new Map<keyof PlayerEventMap, Set<(payload?: unknown) => void>>();

  const on = <K extends keyof PlayerEventMap>(
    event: K,
    handler: (payload: PlayerEventMap[K]) => void,
  ): (() => void) => {
    let set = handlers.get(event);
    if (!set) {
      set = new Set();
      handlers.set(event, set);
    }
    const entry = handler as (payload?: unknown) => void;
    set.add(entry);
    return () => set!.delete(entry);
  };

  const emit = <K extends keyof PlayerEventMap>(
    event: K,
    ...args: PlayerEventMap[K] extends void ? [] : [PlayerEventMap[K]]
  ): void => {
    handlers.get(event)?.forEach(handler => handler(args[0]));
  };

  return { on, emit };
}

export const playerEvents = createPlayerEmitter();
