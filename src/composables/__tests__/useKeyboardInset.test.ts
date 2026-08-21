import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { computeKeyboardInset, useKeyboardInset } from "../useKeyboardInset";

class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
}

const setInnerHeight = (value: number): void => {
  Object.defineProperty(window, "innerHeight", {
    value,
    configurable: true,
    writable: true,
  });
};

const setVisualViewport = (value: FakeVisualViewport | null): void => {
  Object.defineProperty(window, "visualViewport", {
    value,
    configurable: true,
    writable: true,
  });
};

describe("computeKeyboardInset", () => {
  it("is 0 when the visual viewport fills the layout viewport", () => {
    expect(computeKeyboardInset(800, { height: 800, offsetTop: 0 })).toBe(0);
  });

  it("returns the keyboard overlap when only the visual viewport shrank", () => {
    expect(computeKeyboardInset(800, { height: 500, offsetTop: 0 })).toBe(300);
  });

  it("subtracts the visual viewport offset so panning is not counted twice", () => {
    expect(computeKeyboardInset(800, { height: 500, offsetTop: 100 })).toBe(200);
  });

  it("clamps to 0 when the layout viewport already resized past the keyboard", () => {
    expect(computeKeyboardInset(500, { height: 500, offsetTop: 40 })).toBe(0);
  });

  it("rounds fractional viewport heights to whole pixels", () => {
    expect(computeKeyboardInset(800, { height: 499.6, offsetTop: 0 })).toBe(300);
  });
});

describe("useKeyboardInset", () => {
  let viewport: FakeVisualViewport;
  const wrappers: VueWrapper[] = [];

  const mountInset = () => {
    let inset!: ReturnType<typeof useKeyboardInset>["keyboardInset"];
    const wrapper = mount(defineComponent({
      setup: () => {
        inset = useKeyboardInset().keyboardInset;
        return () => null;
      },
    }));
    wrappers.push(wrapper);
    return inset;
  };

  const flushFrame = () => {
    vi.advanceTimersToNextFrame();
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    viewport = new FakeVisualViewport();
    setVisualViewport(viewport);
    setInnerHeight(800);
  });

  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount();
    setVisualViewport(null);
    vi.useRealTimers();
  });

  it("starts at 0 when the keyboard is closed", () => {
    const inset = mountInset();
    expect(inset.value).toBe(0);
  });

  it("reports the overlap when the keyboard shrinks only the visual viewport", () => {
    const inset = mountInset();

    viewport.height = 440;
    viewport.dispatchEvent(new Event("resize"));
    flushFrame();

    expect(inset.value).toBe(360);
  });

  it("stays 0 when the layout viewport resizes together with the keyboard", () => {
    const inset = mountInset();

    setInnerHeight(440);
    viewport.height = 440;
    viewport.dispatchEvent(new Event("resize"));
    flushFrame();

    expect(inset.value).toBe(0);
  });

  it("accounts for visual viewport panning via offsetTop", () => {
    const inset = mountInset();

    viewport.height = 440;
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    flushFrame();

    expect(inset.value).toBe(240);
  });

  it("coalesces bursts of viewport events into a single frame measure", () => {
    const inset = mountInset();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame");

    viewport.height = 500;
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    flushFrame();

    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(inset.value).toBe(300);
    rafSpy.mockRestore();
  });

  it("drops back to 0 when the keyboard closes", () => {
    const inset = mountInset();

    viewport.height = 440;
    viewport.dispatchEvent(new Event("resize"));
    flushFrame();
    expect(inset.value).toBe(360);

    viewport.height = 800;
    viewport.dispatchEvent(new Event("resize"));
    flushFrame();
    expect(inset.value).toBe(0);
  });

  it("is inert when visualViewport is unavailable", () => {
    setVisualViewport(null);
    const inset = mountInset();
    expect(inset.value).toBe(0);
  });
});
