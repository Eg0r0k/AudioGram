import type { ComputedRef, InjectionKey } from "vue";

// Playback progress for the card's bar, as a ref: read through a prop it
// re-rendered MiniPlayer, the card and every child of the card on each
// tick; injected, only the bar itself does.
export const miniPlayerProgressKey: InjectionKey<ComputedRef<number>> = Symbol("miniPlayerProgress");
