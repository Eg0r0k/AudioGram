import { readonly, ref } from "vue";
import { createSharedComposable, tryOnScopeDispose, useEventListener } from "@vueuse/core";

export const computeKeyboardInset = (
  layoutViewportHeight: number,
  visual: Pick<VisualViewport, "height" | "offsetTop">,
): number => Math.max(0, Math.round(layoutViewportHeight - visual.height - visual.offsetTop));

const useKeyboardInsetSource = () => {
  const keyboardInset = ref(0);
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;

  if (viewport) {
    let frame: number | null = null;

    const measure = (): void => {
      frame = null;
      keyboardInset.value = computeKeyboardInset(window.innerHeight, viewport);
    };

    const schedule = (): void => {
      if (frame !== null) return;
      frame = requestAnimationFrame(measure);
    };

    useEventListener(viewport, "resize", schedule, { passive: true });
    useEventListener(viewport, "scroll", schedule, { passive: true });
    useEventListener(window, "resize", schedule, { passive: true });
    tryOnScopeDispose(() => {
      if (frame !== null) cancelAnimationFrame(frame);
    });

    measure();
  }

  return { keyboardInset: readonly(keyboardInset) };
};

/**
 * Fallback for WebViews where the CSS-only route above is not honoured:
 * exposes the keyboard overlap so panels can pad their bottom actions.
 * No-op (always 0) on desktop and whenever `resizes-content` works.
 * Shared so the whole app holds one set of viewport listeners.
 */
export const useKeyboardInset = createSharedComposable(useKeyboardInsetSource);
