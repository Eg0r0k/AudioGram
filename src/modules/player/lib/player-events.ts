import type { EventBusKey } from "@vueuse/core";
import type { PlayerTrack } from "../types";

/**
 * Player lifecycle events, carried over VueUse's useEventBus. These are
 * moments, not state: encoding them as counter refs loses ordering across
 * watchers and forces every subscriber to track "did I already react to this
 * value". Subscribers register in player-lifecycle.ts, where reaction order
 * is explicit and synchronous.
 */

/** currentTrack changed: a new track started, or playback was cleared. */
export const trackChangedEvent: EventBusKey<PlayerTrack | null> = Symbol("player:trackChanged");

/** The engine played the current track to its end. */
export const trackEndedEvent: EventBusKey<void> = Symbol("player:trackEnded");
