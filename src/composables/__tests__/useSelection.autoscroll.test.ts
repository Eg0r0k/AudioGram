import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSelection } from "../useSelection";

const ROW_HEIGHT = 50;
const LONG_PRESS_MS = 450;
const VIEWPORT_HEIGHT = 400;
const AUTO_SCROLL_MAX_SPEED_PX = 14;

const makeItems = (count: number) =>
  ref(Array.from({ length: count }, (_, i) => ({ id: `t${i}` })));

// Строка под пальцем зависит от scrollTop — имитация виртуального списка:
// elementFromPoint отдаёт строку по (y + scrollTop).
const buildScrollableContainer = (count: number): HTMLElement => {
  const container = document.createElement("div");
  container.style.overflowY = "auto";
  Object.defineProperty(container, "scrollHeight", { value: count * ROW_HEIGHT, configurable: true });
  Object.defineProperty(container, "clientHeight", { value: VIEWPORT_HEIGHT, configurable: true });
  container.getBoundingClientRect = () =>
    ({ top: 0, bottom: VIEWPORT_HEIGHT, left: 0, right: 300, width: 300, height: VIEWPORT_HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.dataset.selectableId = `t${i}`;
    row.dataset.selectableIndex = String(i);
    container.appendChild(row);
  }
  document.body.appendChild(container);

  vi.spyOn(document, "elementFromPoint").mockImplementation(
    (_x: number, y: number) =>
      container.children[Math.floor((y + container.scrollTop) / ROW_HEIGHT)] ?? null,
  );
  return container;
};

const touchEvent = (type: string, x: number, y: number, target: EventTarget): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientX: x, clientY: y, target }],
  });
  return event;
};

describe("useSelection touch autoscroll", () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let selection: ReturnType<typeof useSelection>;
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let rafId: number;

  const flushFrames = (count: number) => {
    for (let i = 0; i < count; i++) {
      const pending = [...rafCallbacks.entries()];
      rafCallbacks.clear();
      pending.forEach(([, cb]) => cb(performance.now()));
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = new Map();
    rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.set(++rafId, cb);
      return rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => rafCallbacks.delete(id));
    Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });

    container = buildScrollableContainer(40);
    selection = useSelection(makeItems(40));
    cleanup = selection.attachDragListeners(container);
  });

  afterEach(() => {
    cleanup();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Реальный браузер диспатчит все события touch-жеста на узел touchstart —
  // там теперь живут drag-слушатели, поэтому тесты диспатчат туда же.
  let gestureNode: Element;

  // y — визуальная координата: позиция строки минус текущий scrollTop,
  // иначе тест со стартовым scrollTop попадает пальцем не в ту строку.
  const longPressRow = (index: number) => {
    const y = index * ROW_HEIGHT + ROW_HEIGHT / 2 - container.scrollTop;
    gestureNode = container.children[index]!;
    container.dispatchEvent(touchEvent("touchstart", 10, y, gestureNode));
    vi.advanceTimersByTime(LONG_PRESS_MS);
  };

  it("scrolls down and keeps extending the selection while the finger holds the bottom edge", () => {
    longPressRow(0);
    gestureNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, gestureNode));

    const before = container.scrollTop;
    flushFrames(10);

    expect(container.scrollTop).toBeGreaterThan(before);
    expect(selection.selectedCount.value).toBeGreaterThan(8);
  });

  it("stops scrolling when the finger leaves the edge zone", () => {
    longPressRow(0);
    gestureNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, gestureNode));
    flushFrames(5);

    gestureNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT / 2, gestureNode));
    const settled = container.scrollTop;
    flushFrames(5);

    expect(container.scrollTop).toBe(settled);
  });

  it("stops scrolling on touchend", () => {
    longPressRow(0);
    gestureNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, gestureNode));
    flushFrames(3);

    gestureNode.dispatchEvent(touchEvent("touchend", 0, 0, gestureNode));
    const settled = container.scrollTop;
    flushFrames(5);

    expect(container.scrollTop).toBe(settled);
  });

  it("stops the drag when the finger lifts after the start row was virtualized away", () => {
    const startNode = container.children[0]!;
    longPressRow(0);
    startNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, startNode));
    flushFrames(3);
    expect(container.scrollTop).toBeGreaterThan(0);

    // VirtualScrollable размонтирует стартовую строку, когда она уезжает из
    // окна рендера. Браузер продолжает диспатчить события жеста на (уже
    // отсоединённый) узел touchstart — из отсоединённого дерева ничего не
    // всплывает до window, так что window-слушатели отпускание не увидят.
    startNode.remove();
    startNode.dispatchEvent(touchEvent("touchend", 0, 0, startNode));

    const settled = container.scrollTop;
    flushFrames(5);

    expect(container.scrollTop).toBe(settled);
  });

  it("scrolls up near the top edge", () => {
    container.scrollTop = 500;
    longPressRow(12);
    gestureNode.dispatchEvent(touchEvent("touchmove", 10, 10, gestureNode));
    flushFrames(5);

    expect(container.scrollTop).toBeLessThan(500);
  });

  it("clamps scroll speed to the max even when the finger is far past the bottom edge", () => {
    longPressRow(0);
    gestureNode.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT + 100, gestureNode));

    const before = container.scrollTop;
    flushFrames(1);

    expect(container.scrollTop - before).toBe(AUTO_SCROLL_MAX_SPEED_PX);
  });
});

describe("useSelection touch autoscroll - scroller resolution", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let rafId: number;

  const flushFrames = (count: number) => {
    for (let i = 0; i < count; i++) {
      const pending = [...rafCallbacks.entries()];
      rafCallbacks.clear();
      pending.forEach(([, cb]) => cb(performance.now()));
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = new Map();
    rafId = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.set(++rafId, cb);
      return rafId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => rafCallbacks.delete(id));
    Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  // Скроллируемый элемент без строк-детей — для сценариев, где скроллер не
  // совпадает со списком строк (явный scrollEl) или где сам список строк
  // — вложенный потомок нескроллируемого враппера.
  const makeScrollableEl = (count: number): HTMLElement => {
    const el = document.createElement("div");
    el.style.overflowY = "auto";
    Object.defineProperty(el, "scrollHeight", { value: count * ROW_HEIGHT, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: VIEWPORT_HEIGHT, configurable: true });
    el.getBoundingClientRect = () =>
      ({ top: 0, bottom: VIEWPORT_HEIGHT, left: 0, right: 300, width: 300, height: VIEWPORT_HEIGHT, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return el;
  };

  it("scrolls a scrollable descendant when the container itself is not scrollable (AlbumPage/AddTracksPanel shape)", () => {
    const outer = document.createElement("div");
    const scroller = makeScrollableEl(40);
    for (let i = 0; i < 40; i++) {
      const row = document.createElement("div");
      row.dataset.selectableId = `t${i}`;
      row.dataset.selectableIndex = String(i);
      scroller.appendChild(row);
    }
    outer.appendChild(scroller);
    document.body.appendChild(outer);

    vi.spyOn(document, "elementFromPoint").mockImplementation(
      (_x: number, y: number) =>
        scroller.children[Math.floor((y + scroller.scrollTop) / ROW_HEIGHT)] ?? null,
    );

    const selection = useSelection(makeItems(40));
    const cleanup = selection.attachDragListeners(outer);

    outer.dispatchEvent(touchEvent("touchstart", 10, ROW_HEIGHT / 2, scroller.children[0]!));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    scroller.children[0]!.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, scroller.children[0]!));

    const before = scroller.scrollTop;
    flushFrames(10);

    expect(scroller.scrollTop).toBeGreaterThan(before);
    expect(outer.scrollTop).toBe(0);

    cleanup();
  });

  it("scrolls the explicit scrollEl option instead of the (also scrollable) container", () => {
    const container = buildScrollableContainer(40);
    const explicitScrollEl = makeScrollableEl(40);
    document.body.appendChild(explicitScrollEl);

    const selection = useSelection(makeItems(40));
    const cleanup = selection.attachDragListeners(container, { scrollEl: explicitScrollEl });

    container.dispatchEvent(touchEvent("touchstart", 10, ROW_HEIGHT / 2, container.children[0]!));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    container.children[0]!.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, container.children[0]!));

    flushFrames(10);

    expect(explicitScrollEl.scrollTop).toBeGreaterThan(0);
    expect(container.scrollTop).toBe(0);

    cleanup();
  });

  it("stops the autoscroll rAF loop when the returned cleanup runs mid-drag", () => {
    const container = buildScrollableContainer(40);
    const selection = useSelection(makeItems(40));
    const cleanup = selection.attachDragListeners(container);

    container.dispatchEvent(touchEvent("touchstart", 10, ROW_HEIGHT / 2, container.children[0]!));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    container.children[0]!.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, container.children[0]!));
    flushFrames(3);

    expect(rafCallbacks.size).toBeGreaterThan(0);

    cleanup();

    expect(rafCallbacks.size).toBe(0);
    const settled = container.scrollTop;
    flushFrames(5);

    expect(rafCallbacks.size).toBe(0);
    expect(container.scrollTop).toBe(settled);
  });
});
