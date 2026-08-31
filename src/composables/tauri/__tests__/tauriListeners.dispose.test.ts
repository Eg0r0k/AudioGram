import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listenMock = vi.hoisted(() => vi.fn());
const onDragDropEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/environment/userAgent", () => ({
  IS_TAURI: true,
  IS_MOBILE: false,
  IS_WINDOWS: false,
}));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ onDragDropEvent: onDragDropEventMock }),
}));

import useTauriEvent from "../useTauriEvent";
import { useTauriDragDrop } from "../useTauriDragDrop";

// Both composables reach their subscription through a dynamic import(),
// which does not settle on microtasks alone.
const flush = async () => {
  await vi.dynamicImportSettled();
  await Promise.resolve();
};

describe("tauri listener disposal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("useTauriEvent", () => {
    it("drops a subscription that lands after cleanup ran", async () => {
      const stop = vi.fn();
      let resolveListen!: (unlisten: () => void) => void;
      listenMock.mockReturnValue(new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }));

      const cleanup = useTauriEvent<string>("greet", () => {});

      // The scope dies while the subscription is still in flight: cleanup
      // finds nothing to unsubscribe.
      cleanup();

      resolveListen(stop);
      await flush();

      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("still unsubscribes normally when cleanup runs after setup", async () => {
      const stop = vi.fn();
      listenMock.mockResolvedValue(stop);

      const cleanup = useTauriEvent<string>("greet", () => {});
      await flush();
      expect(stop).not.toHaveBeenCalled();

      cleanup();
      expect(stop).toHaveBeenCalledTimes(1);

      // A second call must not unsubscribe twice.
      cleanup();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("useTauriDragDrop", () => {
    it("drops a subscription that lands after cleanup ran", async () => {
      const stop = vi.fn();
      let resolveListen!: (unlisten: () => void) => void;
      onDragDropEventMock.mockReturnValue(new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }));

      const cleanup = useTauriDragDrop(() => {});
      cleanup();

      resolveListen(stop);
      await flush();

      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("still unsubscribes normally when cleanup runs after setup", async () => {
      const stop = vi.fn();
      onDragDropEventMock.mockResolvedValue(stop);

      const cleanup = useTauriDragDrop(() => {});
      await flush();
      expect(stop).not.toHaveBeenCalled();

      cleanup();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });
});
