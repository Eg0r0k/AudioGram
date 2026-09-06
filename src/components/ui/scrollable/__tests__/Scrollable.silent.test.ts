import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Scrollable from "../Scrollable.vue";

const VIEWPORT = 400;
const CONTENT = 4000;

const installLayoutStubs = () => {
  const viewportOnly = { configurable: true, get(this: HTMLElement) { return this.classList.contains("scrollable") ? VIEWPORT : 0; } };
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", viewportOnly);
  Object.defineProperty(HTMLElement.prototype, "clientHeight", viewportOnly);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains("scrollable") ? CONTENT : 0; },
  });
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
};

// useScrollable throttles its measurement through rAF or a 24ms timer.
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 40));
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  await nextTick();
};

describe("Scrollable — silent scroll", () => {
  beforeEach(installLayoutStubs);
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a silent move to the end fires neither scroll nor scrolledBottom", async () => {
    const onScroll = vi.fn();
    const onScrolledBottom = vi.fn();
    const wrapper = mount(Scrollable, {
      props: { onScroll, onScrolledBottom },
      slots: { default: "<div style='height:4000px'></div>" },
    });
    await settle();
    const container = wrapper.find(".scrollable").element as HTMLElement;
    const vm = wrapper.vm as unknown as { setScrollPositionSilently: (offset: number) => void };

    // 200px from the end: inside the 300px trigger zone.
    vm.setScrollPositionSilently(CONTENT - VIEWPORT - 200);
    container.dispatchEvent(new Event("scroll"));
    await settle();

    expect(container.scrollTop).toBe(CONTENT - VIEWPORT - 200);
    expect(onScroll).not.toHaveBeenCalled();
    expect(onScrolledBottom).not.toHaveBeenCalled();

    // The user keeps scrolling down; the bottom trigger only fires on a
    // downward move, so this is the first legitimate call.
    container.scrollTop = CONTENT - VIEWPORT - 100;
    container.dispatchEvent(new Event("scroll"));
    await settle();

    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onScrolledBottom).toHaveBeenCalledTimes(1);
  });
});
