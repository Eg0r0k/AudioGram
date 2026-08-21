import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSelection } from "../useSelection";

const ROW_HEIGHT = 50;
const LONG_PRESS_MS = 450;

const makeItems = (count: number) =>
  ref(Array.from({ length: count }, (_, i) => ({ id: `t${i}` })));

// happy-dom не считает layout: elementFromPoint мапится на строку по y-координате.
const buildContainer = (count: number): HTMLElement => {
  const container = document.createElement("div");
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.dataset.selectableId = `t${i}`;
    row.dataset.selectableIndex = String(i);
    container.appendChild(row);
  }
  document.body.appendChild(container);
  vi.spyOn(document, "elementFromPoint").mockImplementation(
    (_x: number, y: number) => container.children[Math.floor(y / ROW_HEIGHT)] ?? null,
  );
  return container;
};

// happy-dom не даёт собрать настоящий TouchEvent — хватает Event с touches.
const touchEvent = (type: string, x: number, y: number, target: EventTarget): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    value: type === "touchend" || type === "touchcancel"
      ? []
      : [{ clientX: x, clientY: y, target }],
  });
  return event;
};

const rowY = (index: number) => index * ROW_HEIGHT + ROW_HEIGHT / 2;

describe("useSelection touch long-press", () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let selection: ReturnType<typeof useSelection>;
  let vibrate: ReturnType<typeof vi.fn>;

  const touchStartOnRow = (index: number) => {
    const target = container.children[index]!;
    container.dispatchEvent(touchEvent("touchstart", 10, rowY(index), target));
  };
  const touchMoveTo = (y: number): Event => {
    const event = touchEvent("touchmove", 10, y, container);
    window.dispatchEvent(event);
    return event;
  };
  const touchEnd = () => window.dispatchEvent(touchEvent("touchend", 0, 0, container));

  beforeEach(() => {
    vi.useFakeTimers();
    vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    container = buildContainer(5);
    selection = useSelection(makeItems(5));
    cleanup = selection.attachDragListeners(container);
  });

  afterEach(() => {
    cleanup();
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not select anything on a swipe that starts before the long-press fires", () => {
    touchStartOnRow(0);
    const move = touchMoveTo(rowY(2));
    vi.advanceTimersByTime(LONG_PRESS_MS + 100);

    expect(move.defaultPrevented).toBe(false);
    expect(selection.selectedCount.value).toBe(0);
  });

  it("selects the pressed row after the long-press delay and vibrates", () => {
    touchStartOnRow(1);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(selection.isSelected("t1")).toBe(true);
    expect(selection.selectedCount.value).toBe(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("keeps the long-press armed when the finger moves within the tolerance", () => {
    touchStartOnRow(1);
    touchMoveTo(rowY(1) + 5);
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(selection.isSelected("t1")).toBe(true);
  });

  it("cancels the pending long-press on touchend", () => {
    touchStartOnRow(1);
    vi.advanceTimersByTime(200);
    touchEnd();
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(selection.selectedCount.value).toBe(0);
  });

  it("extends the range while dragging after the long-press and blocks scrolling", () => {
    touchStartOnRow(0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    const move = touchMoveTo(rowY(2));

    expect(move.defaultPrevented).toBe(true);
    expect([...selection.selectedIds.value].sort()).toEqual(["t0", "t1", "t2"]);
  });

  it("deselects the dragged range when the press starts on a selected row", () => {
    selection.toggleById("t0", true);
    selection.toggleById("t1", true);
    selection.toggleById("t2", true);

    touchStartOnRow(0);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touchMoveTo(rowY(2));

    expect(selection.selectedCount.value).toBe(0);
  });

  it("suppresses the synthetic click right after a long-press so the row is not re-toggled", () => {
    const rowClick = vi.fn();
    container.children[1]!.addEventListener("click", rowClick);

    touchStartOnRow(1);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touchEnd();
    container.children[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(rowClick).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    container.children[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(rowClick).toHaveBeenCalledTimes(1);
  });

  it("ignores touches that start on ignored elements", () => {
    const button = document.createElement("button");
    container.children[1]!.appendChild(button);

    container.dispatchEvent(touchEvent("touchstart", 10, rowY(1), button));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(selection.selectedCount.value).toBe(0);
  });
});
