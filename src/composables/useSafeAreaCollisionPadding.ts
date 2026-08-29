import { computed, type ComputedRef } from "vue";
import { useSafeAreaInsets } from "@/composables/useSafeAreaInsets";

export interface CollisionPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

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
  const { top, right, bottom, left } = useSafeAreaInsets();
  return computed(() => ({
    top: top.value,
    right: right.value,
    bottom: bottom.value,
    left: left.value,
  }));
};
