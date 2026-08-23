import { onScopeDispose, ref } from "vue";
import { useEventListener } from "@vueuse/core";
import type { MaybeElementRef } from "@vueuse/core";
import { useHoldAction } from "@/composables/useHoldAction";
import { usePlayerStore } from "../store/player.store";

const HOLD_DELAY_MS = 350;

export interface HoldBoostTarget {
  /** Absolute playback rate applied while the button is held. */
  rate: number;
  canHold: () => boolean;
  /** A plain tap (released before the hold threshold). */
  onTap: () => void;
}

/**
 * Hold-to-boost for transport buttons: holding applies a temporary playback
 * rate, releasing restores the rate the user had before the hold. Built on
 * useHoldAction, which owns the tap-vs-hold split and the pointer lifecycle
 * (including pointercancel); window blur is the one release it cannot see,
 * covered here so the boosted rate cannot stick.
 */
export const useHoldPlaybackBoost = () => {
  const playerStore = usePlayerStore();
  const activeRate = ref<number | null>(null);
  let baseRate = 1;

  const stop = () => {
    if (activeRate.value === null) return;
    activeRate.value = null;
    playerStore.setPlaybackRate(baseRate);
  };

  const start = (rate: number) => {
    if (activeRate.value !== null) return;
    baseRate = playerStore.playbackRate;
    activeRate.value = rate;
    playerStore.setPlaybackRate(rate);
  };

  const bind = (target: MaybeElementRef, { rate, canHold, onTap }: HoldBoostTarget) => {
    useHoldAction(target, {
      onClick: onTap,
      onHoldStart: () => {
        if (canHold()) start(rate);
      },
      onHoldEnd: stop,
    }, { delay: HOLD_DELAY_MS });
  };

  useEventListener(window, "blur", stop);
  onScopeDispose(stop);

  return { activeRate, bind };
};
