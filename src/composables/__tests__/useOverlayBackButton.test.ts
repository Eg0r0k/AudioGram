import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref, type App } from "vue";
import { mount, type ComponentMountingOptions, type VueWrapper } from "@vue/test-utils";
import { routerKey, type NavigationGuard, type Router } from "vue-router";
import { registerOverlayBackHandler, useOverlayBackButton, useOverlayEscape } from "../useOverlayBackButton";

const SENTINEL_KEY = "__audiogramOverlay";
const BASE_KEY = "__audiogramOverlayBase";

// Fake linear history: the composable coordinates real history entries with
// state markers, so the tests simulate an actual entry stack instead of
// spying on calls in isolation. go()/back() dispatch popstate synchronously
// with the landing entry's state, like a (collapsed-timing) browser would.
let stack: unknown[] = [null];
let position = 0;

const landOn = (nextPosition: number) => {
  position = nextPosition;
  window.dispatchEvent(new PopStateEvent("popstate", { state: stack[position] }));
};

const userBack = () => {
  landOn(position - 1);
};

const routerPush = (state: unknown = { router: true }) => {
  history.pushState(state, "");
};

// Minimal stand-in for the vue-router surface the coordinator touches:
// beforeEach guards awaited before the route entry is pushed, and
// options.history.go for paused-listener traversals.
const createFakeRouter = () => {
  const guards: NavigationGuard[] = [];
  let currentPath = "/";
  return {
    beforeEach: (guard: NavigationGuard) => {
      guards.push(guard);
      return () => {
        const index = guards.indexOf(guard);
        if (index !== -1) guards.splice(index, 1);
      };
    },
    options: {
      history: {
        go: (delta: number) => history.go(delta),
      },
    },
    push: async (path: string) => {
      const to = { fullPath: path };
      const from = { fullPath: currentPath };
      for (const guard of [...guards]) {
        await (guard as unknown as (t: unknown, f: unknown) => Promise<void> | void)(to, from);
      }
      currentPath = path;
      history.pushState({ current: path }, "");
    },
  };
};

type FakeRouter = ReturnType<typeof createFakeRouter>;

const withRouter = (fakeRouter: FakeRouter): ComponentMountingOptions<unknown> => ({
  global: {
    plugins: [{ install: (app: App) => app.provide(routerKey, fakeRouter as unknown as Router) }],
  },
});

describe("useOverlayBackButton", () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;
  let goSpy: ReturnType<typeof vi.spyOn>;
  let wrapper: VueWrapper | null = null;
  let extraWrapper: VueWrapper | null = null;

  const playerOpen = ref(false);
  const searchOpen = ref(false);
  const panelDepth = ref(0);
  const playerBack = vi.fn(() => {
    playerOpen.value = false;
  });
  const searchBack = vi.fn(() => {
    searchOpen.value = false;
  });
  const panelBack = vi.fn(() => {
    panelDepth.value = Math.max(0, panelDepth.value - 1);
  });

  const mountHost = (options?: ComponentMountingOptions<unknown>) => {
    const Host = defineComponent({
      setup() {
        useOverlayBackButton();
        registerOverlayBackHandler({ depth: () => (playerOpen.value ? 1 : 0), back: playerBack });
        registerOverlayBackHandler({ depth: () => panelDepth.value, back: panelBack });
        registerOverlayBackHandler({ depth: () => (searchOpen.value ? 1 : 0), back: searchBack });
        return () => null;
      },
    });
    wrapper = mount(Host, options);
  };

  beforeEach(() => {
    stack = [null];
    position = 0;
    playerOpen.value = false;
    searchOpen.value = false;
    panelDepth.value = 0;
    playerBack.mockClear();
    searchBack.mockClear();
    panelBack.mockClear();

    vi.spyOn(history, "state", "get").mockImplementation(() => stack[position]);
    pushStateSpy = vi.spyOn(history, "pushState").mockImplementation((state) => {
      stack = stack.slice(0, position + 1);
      stack.push(state);
      position++;
    });
    replaceStateSpy = vi.spyOn(history, "replaceState").mockImplementation((state) => {
      stack[position] = state;
    });
    goSpy = vi.spyOn(history, "go").mockImplementation((delta?: number) => {
      landOn(position + (delta ?? 0));
    });
    vi.spyOn(history, "back").mockImplementation(() => {
      landOn(position - 1);
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    extraWrapper?.unmount();
    extraWrapper = null;
    vi.restoreAllMocks();
  });

  const tagOf = (state: unknown) =>
    (state as Record<string, { idx: number }> | null)?.[SENTINEL_KEY];

  it("arms one tagged entry per open step and marks the base entry", async () => {
    mountHost();

    playerOpen.value = true;
    await nextTick();
    expect(stack).toHaveLength(2);
    expect((stack[0] as Record<string, unknown>)[BASE_KEY]).toEqual(expect.any(Number));
    expect(tagOf(stack[1])?.idx).toBe(1);

    panelDepth.value = 1;
    await nextTick();
    expect(stack).toHaveLength(3);
    expect(tagOf(stack[2])?.idx).toBe(2);
    expect(position).toBe(2);
  });

  it("back pops LIFO by open order, not registration order", async () => {
    mountHost();
    // Search (registered last) opens FIRST, player second.
    searchOpen.value = true;
    await nextTick();
    playerOpen.value = true;
    await nextTick();

    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    expect(searchBack).not.toHaveBeenCalled();
    await nextTick();

    userBack();
    expect(searchBack).toHaveBeenCalledTimes(1);
  });

  it("hardware back never pushes new entries (Android history intervention)", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();
    panelDepth.value = 1;
    await nextTick();
    pushStateSpy.mockClear();
    replaceStateSpy.mockClear();

    userBack();
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(playerBack).not.toHaveBeenCalled();
    await nextTick();
    // The entry for the still-open player was pushed at ITS open time;
    // nothing may be re-armed from the popstate path (gesture-less pushState
    // is what made the WebView report canGoBack() === false and close the
    // app).
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    expect(goSpy).not.toHaveBeenCalled();

    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("falls through when the stack is empty", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();

    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();

    // Stack empty now: further pops are none of our business (router / OS).
    stack = [null, { router: true }, { router: true }];
    position = 2;
    userBack();
    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    expect(panelBack).not.toHaveBeenCalled();
    expect(searchBack).not.toHaveBeenCalled();
  });

  it("closing from the overlay UI consumes its entry without a second close", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();

    playerOpen.value = false;
    await nextTick();
    // The traversal's own popstate is swallowed: no back() dispatch.
    expect(goSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).toHaveBeenCalledWith(-1);
    expect(playerBack).not.toHaveBeenCalled();
    expect(position).toBe(0);

    // A later real popstate (router back) is none of our business.
    stack = [null, { router: true }];
    position = 1;
    userBack();
    expect(playerBack).not.toHaveBeenCalled();
  });

  it("a multi-step surface takes one press per step", async () => {
    mountHost();
    panelDepth.value = 2;
    await nextTick();
    expect(stack).toHaveLength(3);
    pushStateSpy.mockClear();

    userBack();
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(panelDepth.value).toBe(1);
    await nextTick();
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(goSpy).not.toHaveBeenCalled();

    userBack();
    expect(panelBack).toHaveBeenCalledTimes(2);
    expect(panelDepth.value).toBe(0);
    await nextTick();
    expect(goSpy).not.toHaveBeenCalled();
  });

  it("reconciles when back() collapses more than one step", async () => {
    mountHost();
    panelDepth.value = 2;
    await nextTick();
    panelBack.mockImplementationOnce(() => {
      panelDepth.value = 0;
    });

    userBack();
    expect(panelBack).toHaveBeenCalledTimes(1);
    await nextTick();
    // One press popped one entry; the collapse left one surplus entry that
    // must be consumed silently.
    expect(goSpy).toHaveBeenCalledTimes(1);
    expect(goSpy).toHaveBeenCalledWith(-1);
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(position).toBe(0);
  });

  it("re-opening after a back-close pushes a fresh entry", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();

    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();
    pushStateSpy.mockClear();

    playerOpen.value = true;
    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    userBack();
    expect(playerBack).toHaveBeenCalledTimes(2);
  });

  it("abandons entries buried under router navigation instead of traversing", async () => {
    mountHost();
    searchOpen.value = true;
    await nextTick();
    expect(position).toBe(1);

    // Tapping a search result: router pushes the new route ON TOP of the
    // sentinel, then the search surface goes away.
    routerPush({ current: "/artist/1" });
    searchOpen.value = false;
    await nextTick();

    // history.go here would pop the route entry the user just navigated to
    // and vue-router would bounce them straight back — must NOT happen.
    expect(goSpy).not.toHaveBeenCalled();
    expect(position).toBe(2);
    expect(stack[2]).toEqual({ current: "/artist/1" });
  });

  it("skips an abandoned sentinel when a back press surfaces it", async () => {
    mountHost();
    searchOpen.value = true;
    await nextTick();
    routerPush({ current: "/artist/1" });
    searchOpen.value = false;
    await nextTick();

    // Back from the artist page lands on the abandoned sentinel; the
    // coordinator must chain past it so the press is never dead.
    userBack();
    expect(position).toBe(0);
    expect(searchBack).not.toHaveBeenCalled();
    expect(playerBack).not.toHaveBeenCalled();
  });

  it("ignores foreign pops while its entries are buried, then self-heals", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();
    // Navigation the player survives: its sentinel is now buried.
    routerPush({ current: "/album/2" });

    // First back pops the ROUTE entry — vue-router's navigation, not ours.
    // Acting here would double-act: route change AND player close.
    userBack();
    expect(playerBack).not.toHaveBeenCalled();
    await nextTick();

    // Second back pops our resurfaced sentinel and closes the player.
    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
  });

  it("re-bases on the current entry when opening over a buried stack", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();
    routerPush({ current: "/album/2" });

    // Opening another surface after navigating: the whole open depth (player
    // + panel) is re-armed above the route entry.
    panelDepth.value = 1;
    await nextTick();
    expect(position).toBe(4);
    expect(tagOf(stack[3])?.idx).toBe(1);
    expect(tagOf(stack[4])?.idx).toBe(2);
    expect((stack[2] as Record<string, unknown>)[BASE_KEY]).toEqual(expect.any(Number));
    expect((stack[2] as Record<string, unknown>).current).toBe("/album/2");

    userBack();
    expect(panelBack).toHaveBeenCalledTimes(1);
    await nextTick();
    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();

    // Next back pops the route entry (router's business), surfacing the old
    // abandoned sentinel, which is skipped silently.
    userBack();
    expect(position).toBe(0);
    expect(playerBack).toHaveBeenCalledTimes(1);
    expect(panelBack).toHaveBeenCalledTimes(1);
  });

  it("unregistering an open surface on top consumes its entry", async () => {
    const localOpen = ref(true);
    const localBack = vi.fn();
    const Child = defineComponent({
      setup() {
        registerOverlayBackHandler({ depth: () => (localOpen.value ? 1 : 0), back: localBack });
        return () => null;
      },
    });
    const show = ref(true);
    const Host = defineComponent({
      components: { Child },
      setup() {
        useOverlayBackButton();
        return { show };
      },
      template: "<Child v-if='show' />",
    });
    wrapper = mount(Host);
    await nextTick();
    expect(position).toBe(1);

    show.value = false;
    await nextTick();
    expect(goSpy).toHaveBeenCalledWith(-1);
    expect(position).toBe(0);
    expect(localBack).not.toHaveBeenCalled();
  });

  it("arms entries for surfaces already open when the coordinator mounts", async () => {
    const Registrar = defineComponent({
      setup() {
        registerOverlayBackHandler({ depth: () => (searchOpen.value ? 1 : 0), back: searchBack });
        return () => null;
      },
    });
    extraWrapper = mount(Registrar);
    searchOpen.value = true;
    await nextTick();
    // No coordinator yet: nothing armed.
    expect(position).toBe(0);

    const Coordinator = defineComponent({
      setup() {
        useOverlayBackButton();
        return () => null;
      },
    });
    wrapper = mount(Coordinator);
    await nextTick();
    expect(position).toBe(1);
    expect(tagOf(stack[1])?.idx).toBe(1);

    userBack();
    expect(searchBack).toHaveBeenCalledTimes(1);
  });

  it("close-then-push in one tick ends on the pushed route with no revert", async () => {
    const fakeRouter = createFakeRouter();
    mountHost(withRouter(fakeRouter));
    playerOpen.value = true;
    await nextTick();
    expect(position).toBe(1);

    // Deferred traversal like a real browser: history.go queues, lands later.
    let pendingLand: (() => void) | null = null;
    goSpy.mockImplementation((delta?: number) => {
      const target = position + (delta ?? 0);
      pendingLand = () => landOn(target);
    });

    // Menu action ("go to artist"): navigate and close the player in the
    // same tick — this raced before and popped the artist entry back off.
    const navigation = fakeRouter.push("/artist/1");
    playerOpen.value = false;
    await nextTick();

    // The guard is holding the push until the traversal lands.
    expect(stack.some(state => (state as Record<string, unknown> | null)?.current === "/artist/1")).toBe(false);
    expect(pendingLand).not.toBeNull();
    pendingLand!();
    await navigation;

    expect(stack[stack.length - 1]).toEqual({ current: "/artist/1" });
    expect(position).toBe(stack.length - 1);
    // Sentinel consumed BEFORE the push: no sentinel left under the route.
    expect(stack).toHaveLength(2);

    await nextTick();
    expect(goSpy).toHaveBeenCalledTimes(1);
  });

  it("push with surfaces still open consumes entries and closes them first", async () => {
    const fakeRouter = createFakeRouter();
    mountHost(withRouter(fakeRouter));
    playerOpen.value = true;
    await nextTick();
    panelDepth.value = 1;
    await nextTick();
    expect(position).toBe(2);

    await fakeRouter.push("/album/9");
    expect(playerBack).toHaveBeenCalledTimes(1);
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(stack[stack.length - 1]).toEqual({ current: "/album/9" });
    // Both sentinels consumed before the push landed on the base entry.
    expect(stack).toHaveLength(2);
    expect(position).toBe(1);
  });

  it("navigation with a buried stack proceeds untouched", async () => {
    const fakeRouter = createFakeRouter();
    mountHost(withRouter(fakeRouter));
    playerOpen.value = true;
    await nextTick();
    // Foreign entry buried the sentinel (e.g. a navigation that bypassed the
    // guard before it existed).
    routerPush({ current: "/album/2" });

    await fakeRouter.push("/next");
    // Never traverse over entries we do not own — the buried sentinel is
    // abandoned in place and the new route entry stays.
    expect(goSpy).not.toHaveBeenCalled();
    expect(stack[stack.length - 1]).toEqual({ current: "/next" });
    expect(position).toBe(stack.length - 1);
    // Navigating away still dismisses the open surface.
    expect(playerBack).toHaveBeenCalledTimes(1);
  });

  it("unmounting the coordinator with surfaces open consumes remaining entries", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();
    panelDepth.value = 1;
    await nextTick();

    wrapper?.unmount();
    wrapper = null;
    expect(goSpy).toHaveBeenCalledWith(-2);
    expect(position).toBe(0);
  });
});

describe("useOverlayEscape", () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let wrapper: VueWrapper | null = null;

  const folderOpen = ref(false);
  const queueOpen = ref(false);
  const panelDepth = ref(0);
  const folderBack = vi.fn(() => {
    folderOpen.value = false;
  });
  const queueBack = vi.fn(() => {
    queueOpen.value = false;
  });
  const panelBack = vi.fn(() => {
    panelDepth.value = Math.max(0, panelDepth.value - 1);
  });

  const mountEscHost = () => {
    const Host = defineComponent({
      setup() {
        useOverlayEscape();
        registerOverlayBackHandler({ depth: () => (folderOpen.value ? 1 : 0), back: folderBack });
        registerOverlayBackHandler({ depth: () => panelDepth.value, back: panelBack });
        registerOverlayBackHandler({ depth: () => (queueOpen.value ? 1 : 0), back: queueBack });
        return () => null;
      },
    });
    wrapper = mount(Host);
  };

  const pressEscape = async () => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    // The coordinator decides one microtask after the dispatch.
    await Promise.resolve();
    return event;
  };

  beforeEach(() => {
    folderOpen.value = false;
    queueOpen.value = false;
    panelDepth.value = 0;
    folderBack.mockClear();
    queueBack.mockClear();
    panelBack.mockClear();
    pushStateSpy = vi.spyOn(history, "pushState").mockImplementation(() => {});
    vi.spyOn(history, "go").mockImplementation(() => {});
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.querySelectorAll("[data-dismissable-layer]").forEach(el => el.remove());
    vi.restoreAllMocks();
  });

  it("closes the most recently opened surface first, then walks the stack", async () => {
    mountEscHost();
    // Queue (registered last) opens FIRST, folder second — LIFO must follow
    // open time, not registration order.
    queueOpen.value = true;
    await nextTick();
    folderOpen.value = true;
    await nextTick();

    await pressEscape();
    expect(folderBack).toHaveBeenCalledTimes(1);
    expect(queueBack).not.toHaveBeenCalled();
    await nextTick();

    await pressEscape();
    expect(queueBack).toHaveBeenCalledTimes(1);
    await nextTick();

    // Third press: stack empty — nothing happens.
    await pressEscape();
    expect(folderBack).toHaveBeenCalledTimes(1);
    expect(queueBack).toHaveBeenCalledTimes(1);
    // Desktop coordinator never touches history.
    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("steps a chained panel one view per press", async () => {
    mountEscHost();
    panelDepth.value = 3;
    await nextTick();

    await pressEscape();
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(panelDepth.value).toBe(2);
    await nextTick();

    await pressEscape();
    await nextTick();
    await pressEscape();
    expect(panelBack).toHaveBeenCalledTimes(3);
    expect(panelDepth.value).toBe(0);
  });

  it("respects preventDefault from any other handler, even a later-registered one", async () => {
    mountEscHost();
    queueOpen.value = true;
    await nextTick();

    window.addEventListener("keydown", event => event.preventDefault(), { once: true });
    await pressEscape();
    expect(queueBack).not.toHaveBeenCalled();

    await pressEscape();
    expect(queueBack).toHaveBeenCalledTimes(1);
  });

  it("leaves the press to an open reka dismissable layer", async () => {
    mountEscHost();
    queueOpen.value = true;
    await nextTick();

    const layer = document.createElement("div");
    layer.setAttribute("data-dismissable-layer", "");
    document.body.appendChild(layer);

    await pressEscape();
    expect(queueBack).not.toHaveBeenCalled();

    layer.remove();
    await pressEscape();
    expect(queueBack).toHaveBeenCalledTimes(1);
  });

  it("ignores non-Escape keys", async () => {
    mountEscHost();
    queueOpen.value = true;
    await nextTick();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(queueBack).not.toHaveBeenCalled();
  });

  it("skips surfaces that unregistered while open", async () => {
    const localOpen = ref(true);
    const localBack = vi.fn();
    const Child = defineComponent({
      setup() {
        registerOverlayBackHandler({ depth: () => (localOpen.value ? 1 : 0), back: localBack });
        return () => null;
      },
    });
    const show = ref(true);
    const Host = defineComponent({
      components: { Child },
      setup() {
        useOverlayEscape();
        registerOverlayBackHandler({ depth: () => (queueOpen.value ? 1 : 0), back: queueBack });
        return { show };
      },
      template: "<Child v-if='show' />",
    });
    wrapper = mount(Host);
    queueOpen.value = true;
    await nextTick();

    // The child surface opened first (at mount) and never closed — it just
    // unregisters. It must drop out of the stack entirely.
    show.value = false;
    await nextTick();

    await pressEscape();
    expect(queueBack).toHaveBeenCalledTimes(1);
    await nextTick();

    // Stack is empty now: the unregistered surface must not receive presses.
    await pressEscape();
    expect(localBack).not.toHaveBeenCalled();
    expect(queueBack).toHaveBeenCalledTimes(1);
  });
});
