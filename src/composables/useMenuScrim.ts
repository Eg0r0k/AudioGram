import { onScopeDispose, ref, watch, type Ref } from "vue";

/**
 * Visibility for the menu scrim that plugs reka's modality hole: modal menus
 * only set `pointer-events: none` on body, so anything with an explicit
 * pointer-events:auto (overlay internals, custom scrollbar thumbs…) stays
 * clickable THROUGH every layer above it while that lock is on.
 *
 * The scrim must cover exactly that window — not just `open`: reka keeps the
 * body locked until the exit animation finishes, and the cursor auto-close
 * often closes the menu while the pointer is still travelling to its target.
 * So on close the scrim stays up until the body lock is actually released,
 * observed frame-by-frame, and not a moment longer (a late right-click must
 * reach the rows again immediately).
 */
export const useMenuScrim = (active: () => boolean): Readonly<Ref<boolean>> => {
  const visible = ref(active());
  let raf: number | null = null;

  const cancelWait = () => {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  };

  const hideWhenBodyReleased = () => {
    cancelWait();
    const check = () => {
      raf = null;
      if (active()) return;
      if (document.body.style.pointerEvents === "none") {
        raf = requestAnimationFrame(check);
        return;
      }
      visible.value = false;
    };
    raf = requestAnimationFrame(check);
  };

  watch(active, (on) => {
    if (on) {
      cancelWait();
      visible.value = true;
      return;
    }
    hideWhenBodyReleased();
  });

  onScopeDispose(cancelWait);

  return visible;
};
