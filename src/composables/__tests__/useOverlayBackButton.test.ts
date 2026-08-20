import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { registerOverlayBackHandler, useOverlayBackButton } from "../useOverlayBackButton";

const firePopstate = () => {
  window.dispatchEvent(new PopStateEvent("popstate"));
};

describe("useOverlayBackButton", () => {
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;
  let wrapper: VueWrapper | null = null;

  const playerOpen = ref(false);
  const panelOpen = ref(false);
  const playerBack = vi.fn(() => {
    playerOpen.value = false;
  });
  const panelBack = vi.fn(() => {
    panelOpen.value = false;
  });

  const mountHost = () => {
    const Host = defineComponent({
      setup() {
        useOverlayBackButton();
        registerOverlayBackHandler({ isOpen: () => playerOpen.value, back: playerBack, priority: 10 });
        registerOverlayBackHandler({ isOpen: () => panelOpen.value, back: panelBack, priority: 20 });
        return () => null;
      },
    });
    wrapper = mount(Host);
  };

  beforeEach(() => {
    playerOpen.value = false;
    panelOpen.value = false;
    playerBack.mockClear();
    panelBack.mockClear();
    pushStateSpy = vi.spyOn(history, "pushState").mockImplementation(() => {});
    backSpy = vi.spyOn(history, "back").mockImplementation(() => {});
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });

  it("pushes one sentinel entry while overlays are open", async () => {
    mountHost();

    playerOpen.value = true;
    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    const [state] = pushStateSpy.mock.calls[0] as [Record<string, unknown>];
    expect(state.__audiogramOverlay).toBe(true);

    panelOpen.value = true;
    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });

  it("back closes the topmost overlay and re-arms while others stay open", async () => {
    mountHost();
    playerOpen.value = true;
    panelOpen.value = true;
    await nextTick();
    pushStateSpy.mockClear();

    firePopstate();
    expect(panelBack).toHaveBeenCalledTimes(1);
    expect(playerBack).not.toHaveBeenCalled();

    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);

    firePopstate();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });

  it("closing from the overlay UI consumes the sentinel without a second close", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();

    playerOpen.value = false;
    await nextTick();
    expect(backSpy).toHaveBeenCalledTimes(1);

    // The popstate produced by our own history.back() must be swallowed.
    firePopstate();
    expect(playerBack).not.toHaveBeenCalled();

    // A later real popstate (router back) is none of our business.
    firePopstate();
    expect(playerBack).not.toHaveBeenCalled();
  });

  it("re-entering an overlay after a back-close pushes a fresh sentinel", async () => {
    mountHost();
    playerOpen.value = true;
    await nextTick();

    firePopstate();
    expect(playerBack).toHaveBeenCalledTimes(1);
    await nextTick();
    pushStateSpy.mockClear();

    playerOpen.value = true;
    await nextTick();
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });
});
