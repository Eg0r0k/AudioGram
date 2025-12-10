import { MaybeElementRef, useEventListener, useIntervalFn, useVibrate } from "@vueuse/core";
import { ref, toValue, computed, readonly } from "vue";

export interface UseHoldActionOptions {
  delay?: number;
  interval?: number;
  haptic?: boolean;
}

export const useHoldAction = (
  target: MaybeElementRef<HTMLElement | null>,
  callbacks: {
    onClick?: () => void;
    onHoldStart?: () => void;
    onHold?: (count: number) => void;
    onHoldEnd?: () => void;
  },
  options: UseHoldActionOptions = {},
) => {
  const { delay = 400, interval = 100, haptic = true } = options;
  const { vibrate } = useVibrate({ pattern: [5] });

  const isHolding = ref(false);
  const holdCount = ref(0);
  const wasHeld = ref(false);
  let holdTimer: number | null = null;

  const { pause, resume } = useIntervalFn(
    () => {
      holdCount.value++;
      callbacks.onHold?.(holdCount.value);
    },
    interval,
    { immediate: false },
  );

  const startHold = () => {
    holdTimer = window.setTimeout(() => {
      isHolding.value = true;
      wasHeld.value = true;
      holdCount.value = 0;

      if (haptic) vibrate();
      callbacks.onHoldStart?.();
      resume();
    }, delay);
  };

  const cancelHold = () => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    pause();

    if (isHolding.value) {
      isHolding.value = false;
      callbacks.onHoldEnd?.();
    }
  };

  const onPointerDown = () => {
    wasHeld.value = false;
    startHold();
  };

  const onPointerUp = () => {
    cancelHold();
    if (!wasHeld.value) {
      callbacks.onClick?.();
    }
    wasHeld.value = false;
  };

  useEventListener(target, "pointerdown", onPointerDown, { passive: true });
  useEventListener(target, "pointerup", onPointerUp, { passive: true });
  useEventListener(target, "pointercancel", cancelHold, { passive: true });
  useEventListener(target, "pointerleave", cancelHold, { passive: true });

  return {
    isHolding: readonly(isHolding),
    holdCount: readonly(holdCount),
    isActive: computed(() => isHolding.value || holdTimer !== null),
  };
};
