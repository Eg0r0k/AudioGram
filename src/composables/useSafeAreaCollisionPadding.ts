import { computed, type ComputedRef } from "vue";
import { createSharedComposable, useScreenSafeArea } from "@vueuse/core";

export interface CollisionPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const useSharedSafeArea = createSharedComposable(useScreenSafeArea);

const toPx = (value: string): number => Number.parseFloat(value) || 0;

/**
 * Default `collisionPadding` for reka poppers (menus, submenus).
 *
 * With edge-to-edge enabled on Android the layout viewport extends under the
 * system bars, so a menu opened near the bottom can put its items behind the
 * navigation buttons where they cannot be tapped. Feeding the safe-area
 * insets into the popper's collision padding keeps floating content inside
 * the tappable region; on desktop every inset is 0 and nothing changes.
 */
export const useSafeAreaCollisionPadding = (): ComputedRef<CollisionPadding> => {
  const { top, right, bottom, left } = useSharedSafeArea();
  return computed(() => ({
    top: toPx(top.value),
    right: toPx(right.value),
    bottom: toPx(bottom.value),
    left: toPx(left.value),
  }));
};
