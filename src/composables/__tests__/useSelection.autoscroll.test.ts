import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSelection } from "../useSelection";

const ROW_HEIGHT = 50;
const LONG_PRESS_MS = 450;
const VIEWPORT_HEIGHT = 400;

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

  // y — визуальная координата: позиция строки минус текущий scrollTop,
  // иначе тест со стартовым scrollTop попадает пальцем не в ту строку.
  const longPressRow = (index: number) => {
    const y = index * ROW_HEIGHT + ROW_HEIGHT / 2 - container.scrollTop;
    container.dispatchEvent(touchEvent("touchstart", 10, y, container.children[index]!));
    vi.advanceTimersByTime(LONG_PRESS_MS);
  };

  it("scrolls down and keeps extending the selection while the finger holds the bottom edge", () => {
    longPressRow(0);
    window.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, container));

    const before = container.scrollTop;
    flushFrames(10);

    expect(container.scrollTop).toBeGreaterThan(before);
    expect(selection.selectedCount.value).toBeGreaterThan(8);
  });

  it("stops scrolling when the finger leaves the edge zone", () => {
    longPressRow(0);
    window.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, container));
    flushFrames(5);

    window.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT / 2, container));
    const settled = container.scrollTop;
    flushFrames(5);

    expect(container.scrollTop).toBe(settled);
  });

  it("stops scrolling on touchend", () => {
    longPressRow(0);
    window.dispatchEvent(touchEvent("touchmove", 10, VIEWPORT_HEIGHT - 10, container));
    flushFrames(3);

    window.dispatchEvent(touchEvent("touchend", 0, 0, container));
    const settled = container.scrollTop;
    flushFrames(5);

    expect(container.scrollTop).toBe(settled);
  });

  it("scrolls up near the top edge", () => {
    container.scrollTop = 500;
    longPressRow(12);
    window.dispatchEvent(touchEvent("touchmove", 10, 10, container));
    flushFrames(5);

    expect(container.scrollTop).toBeLessThan(500);
  });
});
