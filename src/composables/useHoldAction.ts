import { ElementOrComponent } from "@/types/utils";
import { MaybeElementRef, useIntervalFn, useVibrate } from "@vueuse/core";
import { ref, toValue, watch } from "vue";

const resolveElement = (el: ElementOrComponent): HTMLElement | null => {
  if (!el) return null;
  if (el instanceof HTMLElement) return el;
  if (el.$el instanceof HTMLElement) return el.$el;
  return null;
};

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

  watch(
    () => toValue(target),
    (value, _, onCleanup) => {
      const el = resolveElement(value);
      if (!el) return;

      el.addEventListener("pointerdown", onPointerDown);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", cancelHold);
      el.addEventListener("pointerleave", cancelHold);

      onCleanup(() => {
        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", cancelHold);
        el.removeEventListener("pointerleave", cancelHold);
      });
    },
    { immediate: true },
  );

  return {
    isHolding,
    holdCount,
  };
};
