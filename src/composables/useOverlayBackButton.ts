import { computed, nextTick, onScopeDispose, reactive, watch } from "vue";
import { useEventListener } from "@vueuse/core";

export interface OverlayBackHandler {
  /** Reactive read: whether this overlay is currently open. */
  isOpen: () => boolean;
  /** Close ONE step: a stacked panel goes one view back, a plain overlay closes. */
  back: () => void;
  /** Higher wins when several overlays are open at once. */
  priority: number;
}

const handlers = reactive<OverlayBackHandler[]>([]);

/**
 * Lets an overlay participate in hardware/browser back navigation.
 * Unregisters automatically with the calling component's scope.
 */
export const registerOverlayBackHandler = (handler: OverlayBackHandler): void => {
  handlers.push(handler);
  onScopeDispose(() => {
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  });
};

const SENTINEL_KEY = "__audiogramOverlay";

/**
 * Makes the back button close overlays instead of leaving the page/app.
 *
 * While any registered overlay is open, one sentinel entry sits on top of the
 * history stack. Back (Android hardware back routed through the WebView
 * history, or the browser button on web) pops the sentinel; the popstate is
 * answered by closing one overlay step, and the sentinel is re-armed if
 * something is still open. Closing an overlay from its own UI consumes the
 * sentinel silently, so the next back keeps its normal meaning.
 *
 * Router state is spread into the sentinel entry: vue-router keeps its
 * position bookkeeping in `history.state`, and clobbering it breaks scroll
 * restoration and back/forward deltas.
 */
export const useOverlayBackButton = (): void => {
  const anyOpen = computed(() => handlers.some(handler => handler.isOpen()));

  let sentinelActive = false;
  let suppressedPops = 0;

  const pushSentinel = (): void => {
    history.pushState({ ...history.state, [SENTINEL_KEY]: true }, "");
    sentinelActive = true;
  };

  watch(anyOpen, (open) => {
    if (open && !sentinelActive) {
      pushSentinel();
    }
    else if (!open && sentinelActive) {
      sentinelActive = false;
      suppressedPops++;
      history.back();
    }
  });

  useEventListener(window, "popstate", () => {
    if (suppressedPops > 0) {
      suppressedPops--;
      return;
    }
    if (!sentinelActive) return;
    sentinelActive = false;

    const topmost = handlers
      .filter(handler => handler.isOpen())
      .sort((a, b) => b.priority - a.priority)[0];
    topmost?.back();

    void nextTick(() => {
      if (anyOpen.value && !sentinelActive) pushSentinel();
    });
  });

  onScopeDispose(() => {
    if (!sentinelActive) return;
    // The layout hosting the coordinator unmounted with an overlay open —
    // consume the orphaned sentinel so back does not need a double press.
    sentinelActive = false;
    suppressedPops++;
    history.back();
  });
};
