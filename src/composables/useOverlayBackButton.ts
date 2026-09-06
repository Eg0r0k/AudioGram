import { computed, inject, nextTick, onScopeDispose, reactive, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import { routerKey } from "vue-router";

export interface OverlayBackHandler {
  /** Back presses it takes to fully dismiss; 0 when closed. */
  depth: () => number;
  /** Undoes one step through the same path as the surface's own close UI. */
  back: () => void;
  /** Stays open across route changes (navigation context, not an overlay). */
  survivesNavigation?: boolean;
}

const handlers = reactive<OverlayBackHandler[]>([]);

export const registerOverlayBackHandler = (handler: OverlayBackHandler): void => {
  handlers.push(handler);
  onScopeDispose(() => {
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  });
};

// Most recently opened surface last; shared by both coordinators so LIFO is
// the same wherever a press comes from.
const openOrder: OverlayBackHandler[] = [];

const totalDepth = computed(() =>
  handlers.reduce((sum, handler) => sum + handler.depth(), 0));

const syncOpenOrder = (): void => {
  for (let i = openOrder.length - 1; i >= 0; i--) {
    const handler = openOrder[i];
    if (!handlers.includes(handler) || handler.depth() === 0) {
      openOrder.splice(i, 1);
    }
  }
  for (const handler of handlers) {
    if (handler.depth() > 0 && !openOrder.includes(handler)) {
      openOrder.push(handler);
    }
  }
};

const topOpenHandler = (): OverlayBackHandler | undefined => {
  syncOpenOrder();
  return openOrder[openOrder.length - 1];
};

// Android shell bridge. WebView.canGoBack() is unreliable there (Chromium's
// history-manipulation intervention marks pushState entries skippable), so
// the shell asks the page for its overlay depth instead of touching history.
interface AndroidBackBridge {
  setOverlayDepth: (depth: number) => void;
}

declare global {
  interface Window {
    AudiogramBack?: AndroidBackBridge;
  }
}

const NATIVE_BACK_EVENT = "audiogram-back";

const SENTINEL_KEY = "__audiogramOverlay";
const BASE_KEY = "__audiogramOverlayBase";

interface SentinelTag {
  gen: number;
  idx: number;
}

let generationCounter = 0;

const readTag = (state: unknown): SentinelTag | null => {
  if (typeof state !== "object" || state === null) return null;
  const raw = (state as Record<string, unknown>)[SENTINEL_KEY];
  if (typeof raw !== "object" || raw === null) return null;
  const { gen, idx } = raw as Record<string, unknown>;
  if (typeof gen !== "number" || typeof idx !== "number") return null;
  return { gen, idx };
};

const readBaseGen = (state: unknown): number | null => {
  if (typeof state !== "object" || state === null) return null;
  const raw = (state as Record<string, unknown>)[BASE_KEY];
  return typeof raw === "number" ? raw : null;
};

// vue-router keeps its position bookkeeping in history.state; clobbering it
// breaks scroll restoration and back/forward deltas.
const stripOwnState = (state: unknown): Record<string, unknown> => {
  if (typeof state !== "object" || state === null) return {};
  const rest = { ...(state as Record<string, unknown>) };
  delete rest[SENTINEL_KEY];
  delete rest[BASE_KEY];
  return rest;
};

const useNativeOverlayBack = (bridge: AndroidBackBridge): void => {
  const popTopSurface = (): void => {
    topOpenHandler()?.back();
  };

  watch(totalDepth, (depth) => {
    syncOpenOrder();
    bridge.setOverlayDepth(depth);
  }, { immediate: true });

  useEventListener(window, NATIVE_BACK_EVENT, popTopSurface);
};

// Every open step owns one tagged history entry, pushed at open time: an
// entry pushed without a user gesture (e.g. from the popstate handler) gets
// marked skippable on Android and the next back press leaves the app.
// History is shared with vue-router, so our entries are never assumed to be
// on top: traversal only happens from our own top entry, entries buried by a
// route push are abandoned in place and skipped if they resurface, and the
// next opening surface re-bases a fresh stack on the current entry.
export const useOverlayBackButton = (): void => {
  const nativeBridge = typeof window === "undefined" ? undefined : window.AudiogramBack;
  if (nativeBridge) {
    useNativeOverlayBack(nativeBridge);
    return;
  }

  let entryCount = 0;
  let generation = 0;
  let suppressedPops = 0;
  let traversalResolvers: Array<() => void> = [];
  let popNavigation = false;

  const router = inject(routerKey, null);

  const onOurTopEntry = (): boolean => {
    if (entryCount === 0) return false;
    const tag = readTag(history.state);
    return tag !== null && tag.gen === generation && tag.idx === entryCount;
  };

  const traverse = (delta: number): void => {
    suppressedPops++;
    // Listeners paused: vue-router reacting to this pop would start a
    // same-route navigation that cancels an in-flight push.
    if (router) router.options.history.go(delta, false);
    else history.go(delta);
  };

  const settleTraversals = (): Promise<void> => {
    if (suppressedPops === 0) return Promise.resolve();
    return new Promise((resolve) => {
      traversalResolvers.push(resolve);
      // A lost popstate must never deadlock navigation.
      setTimeout(resolve, 250);
    });
  };

  const armEntries = (target: number): void => {
    if (!onOurTopEntry()) {
      generation = ++generationCounter;
      entryCount = 0;
      history.replaceState({ ...stripOwnState(history.state), [BASE_KEY]: generation }, "");
    }
    while (entryCount < target) {
      entryCount++;
      history.pushState(
        { ...stripOwnState(history.state), [SENTINEL_KEY]: { gen: generation, idx: entryCount } },
        "",
      );
    }
  };

  const consumeEntries = (count: number): void => {
    // With the stack buried under a route entry, history.go would pop that
    // route instead; the entries are abandoned in place.
    const safeToTraverse = onOurTopEntry();
    entryCount -= count;
    if (safeToTraverse) traverse(-count);
  };

  // Survivors whose entries a navigation consumed: open, but without an entry
  // until they close or re-register. Re-arming mid-navigation would put the
  // entry under the route the router is about to push.
  const suspended = new Set<OverlayBackHandler>();

  const armedDepth = (): number => {
    for (const handler of suspended) {
      if (!handlers.includes(handler) || handler.depth() === 0) suspended.delete(handler);
    }
    return handlers.reduce((sum, handler) => sum + (suspended.has(handler) ? 0 : handler.depth()), 0);
  };

  const suspendSurvivors = (): void => {
    for (const handler of handlers) {
      if (handler.survivesNavigation && handler.depth() > 0) suspended.add(handler);
    }
  };

  // immediate: a coordinator mounted over already-open surfaces (desktop ->
  // mobile layout switch) arms their entries right away.
  watch(totalDepth, () => {
    syncOpenOrder();
    const depth = armedDepth();
    if (depth > entryCount) armEntries(depth);
    else if (depth < entryCount) consumeEntries(entryCount - depth);
  }, { immediate: true });

  const popTopSurface = (): void => {
    topOpenHandler()?.back();
  };

  const dismissibleDepth = (): number =>
    handlers.reduce((sum, handler) => sum + (handler.survivesNavigation ? 0 : handler.depth()), 0);

  const topDismissibleHandler = (): OverlayBackHandler | undefined => {
    syncOpenOrder();
    for (let i = openOrder.length - 1; i >= 0; i--) {
      if (!openOrder[i].survivesNavigation) return openOrder[i];
    }
    return undefined;
  };

  const closeAllSurfaces = (): void => {
    // Bounded: a back() that refuses to shrink depth must not loop forever.
    for (let safety = dismissibleDepth() + 4; safety > 0 && dismissibleDepth() > 0; safety--) {
      topDismissibleHandler()?.back();
    }
  };

  useEventListener(window, "popstate", (event: PopStateEvent) => {
    if (suppressedPops > 0) {
      suppressedPops--;
      if (suppressedPops === 0 && traversalResolvers.length > 0) {
        const resolvers = traversalResolvers;
        traversalResolvers = [];
        for (const resolve of resolvers) resolve();
      }
      return;
    }

    // The router may turn this pop into a navigation in the same turn; the
    // guard below must not take it for a programmatic push.
    popNavigation = true;
    setTimeout(() => {
      popNavigation = false;
    }, 0);

    const landedTag = readTag(event.state);

    if (entryCount > 0) {
      if (landedTag !== null && landedTag.gen === generation && landedTag.idx < entryCount) {
        entryCount = landedTag.idx;
        popTopSurface();
        return;
      }
      if (readBaseGen(event.state) === generation) {
        entryCount = 0;
        popTopSurface();
        return;
      }
      return;
    }

    // An abandoned sentinel resurfaced: skip it. Going back adds no entry, so
    // no gesture is needed here.
    if (landedTag !== null) history.back();
  });

  // Entries are consumed before the router pushes the new route; otherwise the
  // depth watcher's traversal would land after the push and pop the route off.
  const removeNavigationGuard = router?.beforeEach(async (to, from) => {
    // A same-route navigation is what one of our own sentinel pops starts
    // (same URL, delta 0); it writes no entry and must not be acted on.
    if (to.fullPath === from.fullPath) return;
    if (popNavigation) {
      popNavigation = false;
      return;
    }
    await nextTick();
    await settleTraversals();
    if (entryCount === 0) return;
    if (onOurTopEntry()) {
      const count = entryCount;
      entryCount = 0;
      traverse(-count);
      suspendSurvivors();
      closeAllSurfaces();
      await settleTraversals();
      return;
    }
    entryCount = 0;
    suspendSurvivors();
    closeAllSurfaces();
  });

  onScopeDispose(() => {
    removeNavigationGuard?.();
    if (entryCount > 0) consumeEntries(entryCount);
  });
};

// Desktop: Esc closes one step of the most recently opened surface. Decided a
// microtask later so any handler that claims the press via preventDefault
// wins; reka-ui layers dismiss on Esc without preventDefault, so while a
// [data-dismissable-layer] is mounted the press is theirs.
export const useOverlayEscape = (): void => {
  watch(totalDepth, () => syncOpenOrder());

  useEventListener(window, "keydown", (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    queueMicrotask(() => {
      if (event.defaultPrevented) return;
      if (document.querySelector("[data-dismissable-layer]")) return;
      topOpenHandler()?.back();
    });
  });
};
