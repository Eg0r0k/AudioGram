import { render } from "@testing-library/vue";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

// Captures the virtualizer instance the component builds so `measure()` can
// be counted; everything else is the real TanStack implementation.
const virtualizerSpy = vi.hoisted(() => ({ measure: null as MockInstance | null }));
vi.mock("@tanstack/vue-virtual", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/vue-virtual")>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer>[0]) => {
      const virtualizer = actual.useVirtualizer(options);
      virtualizerSpy.measure = vi.spyOn(virtualizer.value, "measure");
      return virtualizer;
    },
  };
});

import VirtualScrollable from "../VirtualScrollable.vue";

interface Row {
  id: string;
}

const ROW_HEIGHT = 40;
const VIEWPORT_HEIGHT = 400;

const makeRows = (count: number, offset = 0): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `r${i + offset}` }));

// jsdom has no layout: give the scroll container a viewport and every row a
// stable top derived from its virtual index, so the virtualizer renders rows
// and the FLIP code has something to read.
let rowRectReads = 0;
let animateCalls = 0;

const installLayoutStubs = () => {
  rowRectReads = 0;
  animateCalls = 0;

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const el = this as HTMLElement;
    if (el.dataset?.vkey !== undefined) {
      rowRectReads++;
      const index = Number(el.dataset.index ?? 0);
      return { top: index * ROW_HEIGHT, bottom: index * ROW_HEIGHT + ROW_HEIGHT, height: ROW_HEIGHT, width: 300, left: 0, right: 300, x: 0, y: index * ROW_HEIGHT, toJSON: () => ({}) } as DOMRect;
    }
    // Only the scroll container has a viewport; the `before`/sticky wrappers
    // must report 0 or they become scrollMargin and push the rows out of view.
    const height = el.classList?.contains("scrollable") ? VIEWPORT_HEIGHT : 0;
    return { top: 0, bottom: height, height, width: 300, left: 0, right: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("scrollable") ? VIEWPORT_HEIGHT : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => 300 });
  // happy-dom implements matchMedia; make sure reduced-motion never disables FLIP here.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: () => {
      animateCalls++;
      return { cancel: () => {}, finished: Promise.resolve() };
    },
  });

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
};

const mountList = (rows: Row[], animateReorder = true) => {
  let current = rows;
  const utils = render(VirtualScrollable<Row>, {
    props: {
      items: current,
      itemHeight: ROW_HEIGHT,
      getItemKey: (index: number) => current[index].id,
      animateReorder,
    },
    slots: { default: `<template #default="{ item }"><span>{{ item.id }}</span></template>` },
  });
  const setItems = async (next: Row[]) => {
    current = next;
    await utils.rerender({ items: next, getItemKey: (index: number) => current[index].id });
    // The component defers measure/FLIP to nextTick after the render.
    await nextTick();
    await nextTick();
  };
  return { ...utils, setItems };
};

const renderedKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-vkey]")).map(el => el.dataset.vkey);

const flush = async () => {
  await nextTick();
  await nextTick();
};

describe("VirtualScrollable — items watchers", () => {
  beforeEach(installLayoutStubs);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the visible window of rows in this harness", async () => {
    const { container } = mountList(makeRows(100));
    await flush();
    const keys = renderedKeys(container);
    expect(keys.length).toBeGreaterThanOrEqual(VIEWPORT_HEIGHT / ROW_HEIGHT);
    expect(keys[0]).toBe("r0");
  });

  it("a new array with the same keys costs no measure() and no FLIP layout reads", async () => {
    const rows = makeRows(100);
    const { setItems } = mountList(rows);
    await flush();
    virtualizerSpy.measure!.mockClear();
    rowRectReads = 0;

    // Same order, fresh identities — what a query refetch or a like toggle produces.
    await setItems(rows.map(row => ({ ...row })));

    expect(virtualizerSpy.measure).toHaveBeenCalledTimes(0);
    expect(rowRectReads).toBe(0);
    expect(animateCalls).toBe(0);
  });

  it("a length change re-measures exactly once", async () => {
    const rows = makeRows(100);
    const { setItems } = mountList(rows, false);
    await flush();
    virtualizerSpy.measure!.mockClear();

    await setItems([...rows, ...makeRows(10, 100)]);

    expect(virtualizerSpy.measure).toHaveBeenCalledTimes(1);
  });

  it("a reorder still snapshots the rendered rows and plays FLIP", async () => {
    const rows = makeRows(100);
    const { container, setItems } = mountList(rows);
    await flush();
    const renderedBefore = renderedKeys(container).length;
    rowRectReads = 0;

    // Swap the first two rows: both stay rendered, so both get a FLIP delta.
    const [first, second, ...rest] = rows;
    await setItems([second, first, ...rest]);

    // One read per rendered row before the render, one after.
    expect(rowRectReads).toBeGreaterThanOrEqual(renderedBefore * 2);
    expect(animateCalls).toBe(2);
  });
});
