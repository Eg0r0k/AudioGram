import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { registerOverlayBackHandler, useOverlayBackButton } from "@/composables/useOverlayBackButton";
import { useRightPanelStore } from "../store/right-panel.store";
import { panelBackDepth } from "../lib/backChain";
import type { PlayerTrack } from "@/modules/player/types";

vi.mock("@/composables/useDeviceLayout", () => ({
  useDeviceLayout: () => ({
    isMobileLayout: { value: true },
    isDesktopLayout: { value: false },
    layoutType: { value: "mobile" },
  }),
}));

// Same fake linear history as the coordinator's own test file: hardware back
// is simulated as a real entry pop with the landing entry's state.
let stack: unknown[] = [null];
let position = 0;

const landOn = (nextPosition: number) => {
  position = nextPosition;
  window.dispatchEvent(new PopStateEvent("popstate", { state: stack[position] }));
};

const userBack = () => {
  landOn(position - 1);
};

describe("mobile right-panel back chain", () => {
  let wrapper: VueWrapper | null = null;
  let store: ReturnType<typeof useRightPanelStore>;

  const track = { id: "t1" } as unknown as PlayerTrack;
  const playerOpen = ref(false);
  const playerBack = vi.fn(() => {
    playerOpen.value = false;
  });

  const mountHost = () => {
    const Host = defineComponent({
      setup() {
        useOverlayBackButton();
        registerOverlayBackHandler({ depth: () => (playerOpen.value ? 1 : 0), back: playerBack });
        registerOverlayBackHandler({
          depth: () => panelBackDepth(store.isOpen, store.view, store.returnToView),
          back: () => store.stepBack(),
        });
        return () => null;
      },
    });
    wrapper = mount(Host);
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useRightPanelStore();
    stack = [null];
    position = 0;
    playerOpen.value = false;
    playerBack.mockClear();

    vi.spyOn(history, "state", "get").mockImplementation(() => stack[position]);
    vi.spyOn(history, "pushState").mockImplementation((state) => {
      stack = stack.slice(0, position + 1);
      stack.push(state);
      position++;
    });
    vi.spyOn(history, "replaceState").mockImplementation((state) => {
      stack[position] = state;
    });
    vi.spyOn(history, "go").mockImplementation((delta?: number) => {
      landOn(position + (delta ?? 0));
    });
    vi.spyOn(history, "back").mockImplementation(() => {
      landOn(position - 1);
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });

  it("maps every view to its true chain length", () => {
    expect(panelBackDepth(false, "none", "none")).toBe(0);
    expect(panelBackDepth(true, "queue", "none")).toBe(1);
    expect(panelBackDepth(true, "lyrics", "none")).toBe(1);
    expect(panelBackDepth(true, "lyrics", "queue")).toBe(2);
    expect(panelBackDepth(true, "chapters", "queue")).toBe(2);
    expect(panelBackDepth(true, "track-info", "none")).toBe(1);
    expect(panelBackDepth(true, "track-info", "queue")).toBe(2);
    expect(panelBackDepth(true, "add-tracks", "none")).toBe(1);
    expect(panelBackDepth(true, "downloads", "none")).toBe(1);
    expect(panelBackDepth(true, "import", "none")).toBe(1);
    expect(panelBackDepth(true, "edit-track", "none")).toBe(2);
    expect(panelBackDepth(true, "entity-select", "none")).toBe(3);
  });

  it("walks the info -> edit -> entity chain one press at a time, fourth closes the player", async () => {
    mountHost();

    playerOpen.value = true;
    await nextTick();
    expect(position).toBe(1);

    store.openTrackInfo({ track }, { depth: 1 });
    await nextTick();
    expect(position).toBe(2);

    // EditTrackPanel: registers its own UI back (unsaved-changes guarded in
    // the real panel; the navigation itself is what matters here).
    const editBack = () => {
      store.openTrackInfo({ track }, { depth: 1 });
    };
    store.openEditTrack({ track }, { depth: 2 });
    store.setUiBackDelegate(editBack);
    await nextTick();
    expect(position).toBe(3);

    // Entity picker: its back returns through the payload's onDone.
    const onDone = () => {
      store.openEditTrack({ track }, { depth: 2 });
    };
    store.openEntitySelect({ kind: "artists", onConfirm: () => {}, onDone });
    const pickerBack = () => {
      onDone();
    };
    store.setUiBackDelegate(pickerBack);
    await nextTick();
    expect(position).toBe(4);
    expect(store.view).toBe("entity-select");

    // Press 1: entity-select -> edit-track (panel remount swaps the delegate).
    userBack();
    expect(store.view).toBe("edit-track");
    store.setUiBackDelegate(editBack);
    store.clearUiBackDelegate(pickerBack);
    await nextTick();
    expect(position).toBe(3);
    expect(playerBack).not.toHaveBeenCalled();

    // Press 2: edit-track -> track-info (track-info has no delegate).
    userBack();
    expect(store.view).toBe("track-info");
    store.clearUiBackDelegate(editBack);
    await nextTick();
    expect(position).toBe(2);
    expect(playerBack).not.toHaveBeenCalled();

    // Press 3: track-info -> panel closed, player still up.
    userBack();
    expect(store.isOpen).toBe(false);
    await nextTick();
    expect(position).toBe(1);
    expect(playerBack).not.toHaveBeenCalled();

    // Press 4: the player itself.
    userBack();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(position).toBe(0);
  });

  it("walks view -> queue -> closed for a queue-returning view", async () => {
    mountHost();

    store.openQueue();
    await nextTick();
    expect(position).toBe(1);

    store.openTrackInfo({ track }, { depth: 1 });
    await nextTick();
    expect(position).toBe(2);
    expect(store.returnToView).toBe("queue");

    userBack();
    expect(store.isOpen).toBe(true);
    expect(store.view).toBe("queue");
    await nextTick();
    expect(position).toBe(1);

    userBack();
    expect(store.isOpen).toBe(false);
    await nextTick();
    expect(position).toBe(0);
  });

  it("one back over track-info closes only the panel, even with the real router reacting", async () => {
    // Real vue-router: its popstate listener starts a same-route (delta-0)
    // navigation whenever a sentinel entry pops. An async global guard ahead
    // of the coordinator's forces that guard chain across a macrotask — which
    // outlives the popNavigation flag's setTimeout(0) backstop. Before the
    // same-route bail existed, the coordinator's guard then consumed the
    // player's entry and closed every surface on a single back press.
    const router = createRouter({
      history: createWebHistory("/"),
      routes: [{ path: "/", component: defineComponent({ render: () => null }) }],
    });
    router.beforeEach(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 2);
      });
    });

    const Host = defineComponent({
      setup() {
        useOverlayBackButton();
        registerOverlayBackHandler({ depth: () => (playerOpen.value ? 1 : 0), back: playerBack });
        registerOverlayBackHandler({
          depth: () => panelBackDepth(store.isOpen, store.view, store.returnToView),
          back: () => store.stepBack(),
        });
        return () => null;
      },
    });
    wrapper = mount(Host, { global: { plugins: [router] } });
    await router.isReady();

    playerOpen.value = true;
    await nextTick();
    store.openTrackInfo({ track }, { depth: 1 });
    await nextTick();
    const armedPosition = position;
    expect(armedPosition).toBeGreaterThanOrEqual(2);

    // ONE hardware back press, then let the router's pop navigation (guards,
    // timers and all) fully settle.
    userBack();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    expect(store.isOpen).toBe(false);
    expect(playerOpen.value).toBe(true);
    expect(playerBack).not.toHaveBeenCalled();
    // The player's entry is still armed for the next press.
    expect(position).toBe(armedPosition - 1);

    userBack();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(playerBack).toHaveBeenCalledTimes(1);
    expect(playerOpen.value).toBe(false);
  });

  it("stepBack prefers the registered delegate and clear is identity-guarded", () => {
    const delegateA = vi.fn();
    const delegateB = vi.fn();

    store.openQueue();
    store.setUiBackDelegate(delegateA);
    store.setUiBackDelegate(delegateB);
    // The outgoing panel's cleanup must not wipe the incoming panel's delegate.
    store.clearUiBackDelegate(delegateA);

    store.stepBack();
    expect(delegateB).toHaveBeenCalledTimes(1);
    expect(delegateA).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);

    store.clearUiBackDelegate(delegateB);
    store.stepBack();
    expect(store.isOpen).toBe(false);
  });
});
