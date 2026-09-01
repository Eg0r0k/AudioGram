import type { PlayerState } from "lyra-audio";

/**
 * The player store's real state, as one discriminated union.
 *
 * Before this existed the same information was spread over three variables
 * (`status`, `_activeFadeAbort`, `_switchingRequestId`) and every entry
 * point had to know which combinations meant what — a fade-out-to-pause,
 * for example, showed `status === "paused"` over an element that was still
 * audibly playing. Each variant below is one of those combinations, named.
 *
 * - `resolving` / `loading`: a track switch is in flight and the engine still
 *   carries the PREVIOUS track's media. Its load() chatter (a reset to
 *   "idle", a resolve through "ready") and its `ended` / `timeupdate` belong
 *   to the outgoing track and must not reach the store. Keyed to the request
 *   id (not a boolean) so any newer request bumping the id closes the window
 *   even when the superseded switch never gets to clean up after itself.
 * - `starting`: the loaded media belongs to the current track and play() has
 *   been issued; the engine's own transitions pass through again. Public
 *   status still reads "loading" — every `starting` ends in playback, and
 *   reporting the gap as anything else makes external transport controls
 *   flicker on each skip.
 * - `fadingOut`: the engine is still audible while the fade ramps down; the
 *   deferred `then` action lands only if `abort` is still untouched.
 *   Leaving this state through any other path MUST abort the controller,
 *   otherwise the element keeps playing silently at gain 0 and later "ends"
 *   into the next track at full volume.
 *
 * A fade-in is deliberately not a variant: lyra owns that ramp (a later
 * fadeTo() cancels it internally), there is no deferred store action to
 * abort, and no decision in the store depends on it — the engine's own
 * playing/buffering transitions are the truth while it ramps.
 */
export type PlaybackStatus
  = | { kind: "idle" }
    | { kind: "resolving"; requestId: number }
    | { kind: "loading"; requestId: number }
    | { kind: "starting" }
    | { kind: "ready" }
    | { kind: "playing" }
    | { kind: "buffering" }
    | { kind: "paused" }
    | { kind: "fadingOut"; abort: AbortController; then: "pause" | "stop" }
    | { kind: "error" };

export type PlaybackStatusKind = PlaybackStatus["kind"];

/** A track switch keyed to `requestId` is in flight: engine events are the outgoing track's. */
export const isSwitching = (s: PlaybackStatus, requestId: number): boolean =>
  (s.kind === "resolving" || s.kind === "loading") && s.requestId === requestId;

/** The engine is producing sound (a fade-out is still audible until its deferred action lands). */
export const isAudible = (s: PlaybackStatus): boolean =>
  s.kind === "playing" || s.kind === "buffering" || s.kind === "fadingOut";

/** What the UI reports as playing. Both fade-outs are optimistic: the button reacts on press, not after the ramp. */
export const isPlayingStatus = (s: PlaybackStatus): boolean =>
  s.kind === "playing" || s.kind === "buffering";

export const isLoadingStatus = (s: PlaybackStatus): boolean =>
  s.kind === "resolving" || s.kind === "loading" || s.kind === "starting";

/** Flattens the union to lyra's `PlayerState` — the shape the read-only `status` field exposes. */
export const toPlayerState = (s: PlaybackStatus): PlayerState => {
  switch (s.kind) {
    case "idle": return "idle";
    case "resolving":
    case "loading":
    case "starting": return "loading";
    case "ready": return "ready";
    case "playing": return "playing";
    case "buffering": return "buffering";
    case "paused": return "paused";
    case "fadingOut": return "paused";
    case "error": return "error";
  }
};

/**
 * Lifts an engine state change into the union. A flat state cannot describe
 * a fade or a switch, so it never produces one; "loading" becomes a switch
 * keyed to `currentRequestId`.
 */
export const fromPlayerState = (state: PlayerState, currentRequestId: number): PlaybackStatus => {
  switch (state) {
    case "loading": return { kind: "loading", requestId: currentRequestId };
    case "ready": return { kind: "ready" };
    case "playing": return { kind: "playing" };
    case "buffering": return { kind: "buffering" };
    case "paused": return { kind: "paused" };
    case "error": return { kind: "error" };
    case "idle":
    case "disposed": return { kind: "idle" };
  }
};

/** Dev-only invariant check; compiled out of production builds. */
export const assertPlaybackInvariant = (condition: boolean, message: string): void => {
  if (import.meta.env.DEV && !condition) {
    throw new Error(`[Player] invariant violated: ${message}`);
  }
};
