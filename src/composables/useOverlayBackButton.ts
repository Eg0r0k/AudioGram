import { computed, inject, nextTick, onScopeDispose, reactive, watch } from "vue";
import { useEventListener } from "@vueuse/core";
import { routerKey } from "vue-router";

export interface OverlayBackHandler {
  /**
   * Back steps this surface currently owns: 0 when closed, N when it takes N
   * back presses to fully dismiss (a stacked panel reports its chain length).
   */
  depth: () => number;
  /**
   * Undo ONE step — must reduce depth() by at least one. Must run the same
   * code path as the surface's own close UI so animations stay identical.
   */
  back: () => void;
}

const handlers = reactive<OverlayBackHandler[]>([]);

/**
 * Lets a dismissible surface participate in back navigation (Android hardware
 * back on mobile, Esc on desktop). Unregisters automatically with the calling
 * component's scope.
 */
export const registerOverlayBackHandler = (handler: OverlayBackHandler): void => {
  handlers.push(handler);
  onScopeDispose(() => {
    const index = handlers.indexOf(handler);
    if (index !== -1) handlers.splice(index, 1);
  });
};

// Open-order tracking shared by both coordinators (mobile history back and
// desktop Esc): most recently opened surface sits at the end. Kept at module
// scope so LIFO order is identical wherever a press is dispatched from; every
// coordinator keeps it fresh from its own totalDepth watcher and it is
// re-synced lazily before each dispatch.
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

const stripOwnState = (state: unknown): Record<string, unknown> => {
  if (typeof state !== "object" || state === null) return {};
  const rest = { ...(state as Record<string, unknown>) };
  delete rest[SENTINEL_KEY];
  delete rest[BASE_KEY];
  return rest;
};

/**
 * Makes the back button close overlays (LIFO) instead of leaving the page/app.
 * Call once in the layout that hosts the overlays.
 *
 * Every open step owns one sentinel history entry, pushed at open time — that
 * is, during the user interaction that opened the surface. This matters on
 * Android: Chromium's history-manipulation intervention marks entries created
 * by pushState WITHOUT a user gesture as skippable, after which
 * WebView.canGoBack() reports false and TauriActivity closes the app.
 * A single-sentinel design that re-arms its entry from inside the popstate
 * handler (no gesture there — hardware back is a programmatic goBack) dies
 * exactly that way on the second back press, so nothing is ever pushed from
 * the popstate path.
 *
 * The coordinator shares window.history with vue-router, so it never assumes
 * its entries sit on top. Each sentinel entry is tagged in history.state with
 * a {gen, idx} marker and the entry underneath the stack carries a base
 * marker. Traversal (history.go) happens only while the current entry is our
 * own top; if router navigation buried the stack, the buried entries are
 * abandoned in place (and skipped silently if a later back press surfaces
 * them), and the next surface to open re-bases a fresh stack on the current
 * entry. A popstate is treated as a back press against the stack only when
 * the landing entry proves the pop came from within it; foreign pops (router
 * back/forward) are ignored entirely.
 *
 * Existing router state is spread into sentinel entries: vue-router keeps its
 * position bookkeeping in history.state, and clobbering it breaks scroll
 * restoration and back/forward deltas.
 */
export const useOverlayBackButton = (): void => {
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
    // Through the router's history with listeners paused: vue-router reacting
    // to this (delta-0-URL) pop would start a same-route navigation that
    // cancels any in-flight router.push.
    if (router) router.options.history.go(delta, false);
    else history.go(delta);
  };

  /** Resolves once every traversal we issued has landed (its popstate arrived). */
  const settleTraversals = (): Promise<void> => {
    if (suppressedPops === 0) return Promise.resolve();
    return new Promise((resolve) => {
      traversalResolvers.push(resolve);
      // Safety net: a lost popstate must never deadlock navigation.
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
    // Traverse only while our top entry is the CURRENT one. If router
    // navigation buried the stack, history.go would pop the route entry and
    // hijack the navigation the user just made — abandon our entries in
    // place instead; the popstate skip below cleans them up if they surface.
    const safeToTraverse = onOurTopEntry();
    entryCount -= count;
    if (safeToTraverse) traverse(-count);
  };

  // immediate: a coordinator (re)mounted while surfaces are already open
  // (desktop -> mobile layout switch) must arm their entries right away.
  // That arming has no user gesture behind it, so Android may flag the
  // entries skippable — still strictly better than the first back press
  // falling through to the OS with an overlay visible.
  watch(totalDepth, (depth) => {
    syncOpenOrder();
    if (depth > entryCount) armEntries(depth);
    else if (depth < entryCount) consumeEntries(entryCount - depth);
  }, { immediate: true });

  const popTopSurface = (): void => {
    topOpenHandler()?.back();
    // back() shrinking depth by exactly one leaves totalDepth === entryCount
    // and the watcher is a no-op; a larger collapse is reconciled there by
    // consuming the surplus entries.
  };

  const closeAllSurfaces = (): void => {
    // Bounded: a back() that fails to shrink depth (e.g. an unsaved-changes
    // dialog intercepting) must not loop forever.
    for (let safety = totalDepth.value + 4; safety > 0 && totalDepth.value > 0; safety--) {
      popTopSurface();
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

    // A real pop: vue-router may start a navigation for it in this same
    // event-loop turn — the beforeEach guard must not treat that navigation
    // as a programmatic push. Flag cleared after the turn's microtasks
    // (where router guards run) have seen it.
    popNavigation = true;
    setTimeout(() => {
      popNavigation = false;
    }, 0);

    const landedTag = readTag(event.state);

    if (entryCount > 0) {
      if (landedTag !== null && landedTag.gen === generation && landedTag.idx < entryCount) {
        // Popped from within our active stack down onto entry #idx.
        entryCount = landedTag.idx;
        popTopSurface();
        return;
      }
      if (readBaseGen(event.state) === generation) {
        // Landed on the base entry beneath our first sentinel — stack spent.
        entryCount = 0;
        popTopSurface();
        return;
      }
      // Foreign pop: router navigating above (or below) our buried entries.
      // Not a press against the overlay stack — vue-router owns it.
      return;
    }

    // Nothing active: an entry we abandoned earlier may surface — skip it so
    // a back press never lands on a dead sentinel. Going back adds no history
    // entries, so no user gesture is needed for this to stay non-skippable.
    if (landedTag !== null) history.back();
  });

  // Programmatic navigations (router.push/replace) while entries are armed:
  // without this guard the depth watcher's queued traversal would land AFTER
  // the router pushed the new route entry and pop it right back off (the
  // "menu navigation goes nowhere" bug). Sentinel entries are consumed and
  // surfaces closed BEFORE the router touches history, so the new route is
  // pushed onto a clean stack.
  const removeNavigationGuard = router?.beforeEach(async (to, from) => {
    // A same-route navigation writes no history entry, so there is nothing
    // to consume here — and it is exactly what vue-router starts when one of
    // OUR sentinel pops lands (same URL, delta 0). Acting on it would eat
    // the remaining entries and close every surface on a single back press.
    // This check is structural; the popNavigation flag below is only a
    // timing-based backstop for cross-route pops.
    if (to.fullPath === from.fullPath) return;
    // History-pop navigations are the popstate handler's jurisdiction —
    // acting on them here would double-act on one back press.
    if (popNavigation) {
      popNavigation = false;
      return;
    }
    // A surface closed in the same tick as this push may not have reached
    // the depth watcher yet — flush first, then let its queued traversal
    // land before the router touches history.
    await nextTick();
    await settleTraversals();
    if (entryCount === 0) return;
    if (onOurTopEntry()) {
      const count = entryCount;
      entryCount = 0;
      traverse(-count);
      closeAllSurfaces();
      await settleTraversals();
      return;
    }
    // Buried under an earlier foreign entry: abandon in place — never pop
    // entries we do not own. Surfaces still close; navigating away is a
    // dismissal.
    entryCount = 0;
    closeAllSurfaces();
  });

  onScopeDispose(() => {
    removeNavigationGuard?.();
    // The layout hosting the coordinator unmounted with surfaces open —
    // consume the orphaned entries so back does not need extra presses.
    if (entryCount > 0) consumeEntries(entryCount);
  });
};

/**
 * Desktop counterpart of useOverlayBackButton: Esc closes overlays with the
 * same LIFO semantics — each press dismisses one step of the most recently
 * opened registered surface. No history manipulation, keydown only. Call once
 * in the desktop layout.
 *
 * The decision is deferred by one microtask so the whole keydown dispatch
 * finishes first: any handler — registered before or after this one — that
 * claims the press via preventDefault is respected (editable cells, selection
 * clearing, custom dialogs). reka-ui layers (menus, dialogs, popovers,
 * tooltips) dismiss themselves on Esc but do NOT reliably preventDefault, so
 * while any [data-dismissable-layer] is mounted the press belongs to it — one
 * Esc must never close both a dropdown and a panel.
 */
export const useOverlayEscape = (): void => {
  // Keep the shared open-order fresh as surfaces open and close, so LIFO
  // ordering matches what the mobile coordinator would compute.
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
