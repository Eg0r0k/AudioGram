import type { EventBusKey } from "@vueuse/core";
import type { PlayerTrack } from "@/modules/player/types";
import type { PlaybackError } from "@/modules/player/service/playback-resolver.service";

/**
 * Queue playback events, carried over VueUse's useEventBus like the player's
 * (see player/lib/player-events.ts). The store decides what to do about a
 * failed entry — skip it, or stop — and announces it; what the user gets to
 * see is player-lifecycle.ts's business, so the store imports no UI.
 */

export interface TrackSkippedPayload {
  track: PlayerTrack;
  error: PlaybackError;
}

export interface PlaybackStalledPayload extends TrackSkippedPayload {
  /** Consecutive transient failures that made the queue give up. */
  failures: number;
}

/** An entry could not be played and the queue moved past it. */
export const trackSkippedEvent: EventBusKey<TrackSkippedPayload> = Symbol("queue:trackSkipped");

/**
 * The queue stopped advancing: several entries in a row failed for reasons
 * that point at the environment (network, engine), not the tracks.
 */
export const playbackStalledEvent: EventBusKey<PlaybackStalledPayload> = Symbol("queue:playbackStalled");
