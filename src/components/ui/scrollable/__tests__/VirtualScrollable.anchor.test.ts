import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VirtualScrollable from "../VirtualScrollable.vue";

interface Row {
  id: string;
}

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;
const ROW_COUNT = 100;

const makeRows = (count: number, offset = 0): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i + offset}` }));

// happy-dom has no layout: the scroll container gets a viewport and a scroll
// height, rows get a top derived from their virtual index.
const installLayoutStubs = () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    if (el.dataset?.vkey !== undefined) {
      const index = Number(el.dataset.index ?? 0);
      return { top: index * ROW_HEIGHT, bottom: index * ROW_HEIGHT + ROW_HEIGHT, height: ROW_HEIGHT, width: 300, left: 0, right: 300, x: 0, y: index * ROW_HEIGHT, toJSON: () => ({}) } as DOMRect;
    }
    const height = el.classList?.contains("scrollable") ? VIEWPORT_HEIGHT : 0;
    return { top: 0, bottom: height, height, width: 300, left: 0, right: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  const viewportOnly = { configurable: true, get(this: HTMLElement) { return this.classList.contains("scrollable") ? VIEWPORT_HEIGHT : 0; } };
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", viewportOnly);
  Object.defineProperty(HTMLElement.prototype, "clientHeight", viewportOnly);
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) { return this.classList.contains("scrollable") ? ROW_COUNT * ROW_HEIGHT : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 300 });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
};

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const flush = async () => {
  await nextFrame();
  await nextTick();
  await nextTick();
};

const mountList = (rows: Row[], extra: Record<string, unknown> = {}) => {
  let current = rows;
  const onScroll = vi.fn();
  const onLoadMore = vi.fn();
  const wrapper = mount(VirtualScrollable<Row>, {
    props: {
      items: current,
      itemHeight: ROW_HEIGHT,
      estimateSize: ROW_HEIGHT,
      getItemKey: (index: number) => current[index].id,
      onScroll,
      onLoadMore,
      ...extra,
    },
    slots: { default: `<template #default="{ item }"><span>{{ item.id }}</span></template>` },
  });
  const container = wrapper.find(".scrollable").element as HTMLElement;
  // Real browsers dispatch `scroll` asynchronously after a programmatic move.
  const browserScrollEvent = async () => {
    container.dispatchEvent(new Event("scroll"));
    await nextTick();
    await nextTick();
  };
  const userScroll = async (top: number) => {
    container.scrollTop = top;
    await browserScrollEvent();
  };
  const setItems = async (next: Row[]) => {
    current = next;
    await wrapper.setProps({ items: next, getItemKey: (index: number) => current[index].id });
    // The anchor adjust runs in the component's nextTick after the render.
    await nextTick();
    await nextTick();
  };
  type Exposed = {
    setScrollPositionSilently: (offset: number) => void;
    getScrollAnchor: () => { key: string | number; delta: number } | null;
    getOffsetForAnchor: (anchor: { key: string | number; delta: number }) => number | null;
  };
  return { wrapper, vm: wrapper.vm as unknown as Exposed, container, onScroll, onLoadMore, userScroll, browserScrollEvent, setItems };
};

describe("VirtualScrollable — silent scroll", () => {
  beforeEach(installLayoutStubs);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("a silent move emits neither scroll nor loadMore, the next user scroll does", async () => {
    const list = mountList(makeRows(ROW_COUNT));
    await flush();

    list.vm.setScrollPositionSilently(ROW_COUNT * ROW_HEIGHT - VIEWPORT_HEIGHT);
    await list.browserScrollEvent();

    expect(list.container.scrollTop).toBe(ROW_COUNT * ROW_HEIGHT - VIEWPORT_HEIGHT);
    expect(list.onScroll).not.toHaveBeenCalled();
    expect(list.onLoadMore).not.toHaveBeenCalled();

    await list.userScroll(ROW_COUNT * ROW_HEIGHT - VIEWPORT_HEIGHT - 8);

    expect(list.onScroll).toHaveBeenCalledTimes(1);
    expect(list.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("the skip flag expires with the frame when no scroll event follows", async () => {
    const list = mountList(makeRows(ROW_COUNT));
    await flush();

    list.vm.setScrollPositionSilently(200);
    await nextFrame();
    await list.userScroll(240);

    expect(list.onScroll).toHaveBeenCalledTimes(1);
  });
});

describe("VirtualScrollable — scroll anchor", () => {
  beforeEach(installLayoutStubs);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("anchors on the first row still visible at the viewport top", async () => {
    const list = mountList(makeRows(ROW_COUNT));
    await flush();

    await list.userScroll(130);

    expect(list.vm.getScrollAnchor()).toEqual({ key: "r3", delta: 10 });
  });

  it("reads cached keys instead of calling getItemKey on the page", async () => {
    // save() runs inside a route-leave guard; a page's getItemKey reaches into
    // its own computeds, which may already be stale there.
    const rows = makeRows(ROW_COUNT);
    const getItemKey = vi.fn((index: number) => rows[index].id);
    const list = mountList(rows, { getItemKey });
    await flush();
    await list.userScroll(130);
    getItemKey.mockClear();

    expect(list.vm.getScrollAnchor()).toEqual({ key: "r3", delta: 10 });
    expect(getItemKey).not.toHaveBeenCalled();
  });

  it("returns no anchor for an empty list", async () => {
    const list = mountList([]);
    await flush();

    expect(list.vm.getScrollAnchor()).toBeNull();
  });

  it("resolves an anchor to the row's new offset after rows were prepended", async () => {
    const list = mountList(makeRows(ROW_COUNT));
    await flush();
    const anchor = { key: "r3", delta: 10 };
    expect(list.vm.getOffsetForAnchor(anchor)).toBe(130);

    await list.setItems([...makeRows(5, 1000), ...makeRows(ROW_COUNT)]);

    expect(list.vm.getOffsetForAnchor(anchor)).toBe(8 * ROW_HEIGHT + 10);
    expect(list.vm.getOffsetForAnchor({ key: "missing", delta: 0 })).toBeNull();
  });
});

describe("VirtualScrollable — keepScrollAnchor", () => {
  beforeEach(installLayoutStubs);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the anchored row in place when rows are inserted above it", async () => {
    const list = mountList(makeRows(ROW_COUNT), { keepScrollAnchor: true });
    await flush();
    await list.userScroll(130);
    list.onScroll.mockClear();

    await list.setItems([...makeRows(5, 1000), ...makeRows(ROW_COUNT)]);
    await list.browserScrollEvent();

    expect(list.container.scrollTop).toBe(8 * ROW_HEIGHT + 10);
    expect(list.onScroll).not.toHaveBeenCalled();
  });

  it("leaves the position alone when rows are only appended", async () => {
    const list = mountList(makeRows(ROW_COUNT), { keepScrollAnchor: true });
    await flush();
    await list.userScroll(130);

    await list.setItems([...makeRows(ROW_COUNT), ...makeRows(5, 1000)]);

    expect(list.container.scrollTop).toBe(130);
  });

  it("does nothing at the very top so new rows are seen", async () => {
    const list = mountList(makeRows(ROW_COUNT), { keepScrollAnchor: true });
    await flush();

    await list.setItems([...makeRows(5, 1000), ...makeRows(ROW_COUNT)]);

    expect(list.container.scrollTop).toBe(0);
  });

  it("falls back to the next visible row when the anchor row was removed", async () => {
    const rows = makeRows(ROW_COUNT);
    const list = mountList(rows, { keepScrollAnchor: true });
    await flush();
    await list.userScroll(130);

    // r3 (the anchor) goes away, two rows land above; r4 was at 160 with
    // delta -30 and now sits at index 5.
    await list.setItems([...makeRows(2, 1000), ...rows.filter(row => row.id !== "r3")]);

    expect(list.container.scrollTop).toBe(5 * ROW_HEIGHT - 30);
  });

  it("is off by default", async () => {
    const list = mountList(makeRows(ROW_COUNT));
    await flush();
    await list.userScroll(130);

    await list.setItems([...makeRows(5, 1000), ...makeRows(ROW_COUNT)]);

    expect(list.container.scrollTop).toBe(130);
  });
});
