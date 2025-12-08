import { useSwipe, UseSwipeOptions } from "@vueuse/core";
import { MaybeRefOrGetter, watch } from "vue";

interface SwipeControlOptions extends UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
}

export const useSwipeControl = (
  target: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: SwipeControlOptions = {},
) => {
  const {
    threshold = 50,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    ...swipeOptions
  } = options;

  const { isSwiping, direction, lengthX, lengthY } = useSwipe(
    target,
    swipeOptions,
  );

  watch(isSwiping, (isSwipingNow) => {
    if (isSwipingNow) return;

    const dir = direction.value;
    const dist
      = dir === "left" || dir === "right"
        ? Math.abs(lengthX.value)
        : Math.abs(lengthY.value);

    if (dist < threshold) return;

    switch (dir) {
      case "left":
        onSwipeLeft?.();
        break;
      case "right":
        onSwipeRight?.();
        break;
      case "up":
        onSwipeUp?.();
        break;
      case "down":
        onSwipeDown?.();
        break;
    }
  });

  return {
    isSwiping,
    direction,
  };
};
