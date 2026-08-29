import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedLocalStorage } from "../debounced-storage";

describe("createDebouncedLocalStorage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of writes into one localStorage write after the delay", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const storage = createDebouncedLocalStorage(300);

    storage.setItem("k", "1");
    storage.setItem("k", "2");
    storage.setItem("k", "3");
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("k")).toBe("3");
  });

  it("reads back a pending value before it has landed", () => {
    const storage = createDebouncedLocalStorage(300);
    localStorage.setItem("k", "old");

    storage.setItem("k", "new");

    expect(storage.getItem("k")).toBe("new");
    expect(localStorage.getItem("k")).toBe("old");
  });

  it("flushes pending writes when the page is hidden", () => {
    const storage = createDebouncedLocalStorage(300);

    storage.setItem("a", "1");
    storage.setItem("b", "2");
    window.dispatchEvent(new Event("pagehide"));

    expect(localStorage.getItem("a")).toBe("1");
    expect(localStorage.getItem("b")).toBe("2");
    vi.advanceTimersByTime(300);
    expect(localStorage.getItem("a")).toBe("1");
  });
});
