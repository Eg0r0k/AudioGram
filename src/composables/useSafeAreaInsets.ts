import { readonly, ref, type Ref } from "vue";
import { createSharedComposable, tryOnScopeDispose, useEventListener } from "@vueuse/core";

const SIDES = ["top", "right", "bottom", "left"] as const;
type Side = (typeof SIDES)[number];

const probeVar = (side: Side) => `--safe-area-inset-${side}`;

const useSafeAreaInsetsSource = () => {
  const insets: Record<Side, Ref<number>> = {
    top: ref(0),
    right: ref(0),
    bottom: ref(0),
    left: ref(0),
  };

  if (typeof window !== "undefined") {
    const root = document.documentElement;
    // env() only exists in CSS. Writing it into custom properties makes the
    // computed style hand back the substituted px value. The write is
    // synchronous so the very first measurement below already sees it —
    // vueuse's useScreenSafeArea sets the same variables from a watcher and
    // reads them before the watcher runs, so it reports "" until the first
    // resize, and then refreshes with a 200ms debounce that lands after the
    // keyboard has already gone.
    for (const side of SIDES) {
      root.style.setProperty(probeVar(side), `env(safe-area-inset-${side}, 0px)`);
    }

    let frame: number | null = null;

    const measure = (): void => {
      frame = null;
      const style = getComputedStyle(root);
      for (const side of SIDES) {
        insets[side].value = Number.parseFloat(style.getPropertyValue(probeVar(side))) || 0;
      }
    };

    const schedule = (): void => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    useEventListener(window, "resize", schedule, { passive: true });
    if (window.visualViewport) {
      useEventListener(window.visualViewport, "resize", schedule, { passive: true });
    }
    tryOnScopeDispose(() => {
      if (frame !== null) cancelAnimationFrame(frame);
    });

    measure();
  }

  return {
    top: readonly(insets.top),
    right: readonly(insets.right),
    bottom: readonly(insets.bottom),
    left: readonly(insets.left),
  };
};

/**
 * The system safe-area insets as numbers (px), for code that has to do
 * arithmetic with them (popper collision padding). Layout that only needs
 * to *apply* an inset should use `env(safe-area-inset-*)` in CSS directly:
 * it is resolved by the same layout pass as everything else, so there is no
 * first-paint mismatch and nothing to re-measure when the keyboard moves.
 */
export const useSafeAreaInsets = createSharedComposable(useSafeAreaInsetsSource);
