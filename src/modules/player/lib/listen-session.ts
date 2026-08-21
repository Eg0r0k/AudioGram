/**
 * Listened-seconds accounting for one stats session.
 *
 * Derived from the audio element's own clock: position deltas between
 * successive engine samples, with seeks re-basing the cursor so a jump never
 * counts as listening. Neither wall clock nor tick counting works here —
 * Android WebView throttles JS timers (and event delivery) in the background
 * while audio keeps playing, so samples may arrive minutes apart, but
 * position deltas stay exact.
 *
 * The session starts UNARMED: between a reset and the moment load() has made
 * the new source the engine's media, the shared engine still plays (and
 * reports positions for) the PREVIOUS track — a rapid skip in that window
 * must not credit those positions to the fresh session. The player arms the
 * session after its load() resolves; until then every sample is dropped.
 */
export interface ListenSession {
  /** Credits the positive delta since the last sample and moves the cursor. */
  sample: (position: number) => void;
  /** Moves (and arms) the cursor without crediting the jump — seeks and
   *  position resets. */
  rebase: (position: number) => void;
  /** Clears accumulated seconds and disarms the session. */
  reset: () => void;
  /** The freshly loaded source starts at position 0 — sampling may begin. */
  arm: () => void;
  seconds: () => number;
}

export const createListenSession = (): ListenSession => {
  let listenedSeconds = 0;
  let cursor: number | null = null;

  return {
    sample: (position) => {
      if (cursor === null || !Number.isFinite(position)) return;
      const delta = position - cursor;
      if (delta > 0) listenedSeconds += delta;
      cursor = position;
    },
    rebase: (position) => {
      if (!Number.isFinite(position)) return;
      cursor = position;
    },
    reset: () => {
      listenedSeconds = 0;
      cursor = null;
    },
    arm: () => {
      cursor = 0;
    },
    seconds: () => listenedSeconds,
  };
};
