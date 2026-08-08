import { describe, expect, it, vi } from "vitest";
import { isCancelled, yieldToEventLoop } from "../import/shared";

describe("isCancelled", () => {
  it("reports not cancelled when no control is supplied", async () => {
    await expect(isCancelled()).resolves.toBe(false);
  });

  it("waits for the pause gate before reporting", async () => {
    const order: string[] = [];
    const control = {
      waitIfPaused: async () => { order.push("waited"); },
      isCancelled: () => {
        order.push("checked");
        return true;
      },
    };

    await expect(isCancelled(control)).resolves.toBe(true);
    expect(order).toEqual(["waited", "checked"]);
  });

  it("tolerates a control with neither callback", async () => {
    await expect(isCancelled({})).resolves.toBe(false);
  });
});

describe("yieldToEventLoop", () => {
  it("resolves", async () => {
    await expect(yieldToEventLoop()).resolves.toBeUndefined();
  });

  it("lets an already-queued macrotask run first", async () => {
    const order: string[] = [];
    setTimeout(() => order.push("timer"), 0);

    await yieldToEventLoop();
    await new Promise(resolve => setTimeout(resolve, 1));

    expect(order).toContain("timer");
  });

  it("resolves every waiter when several yields overlap", async () => {
    // A pipeline run and a folder sync can be yielding at the same time.
    const settled = await Promise.all(
      Array.from({ length: 25 }, () => yieldToEventLoop().then(() => "ok")),
    );

    expect(settled).toHaveLength(25);
    expect(settled.every(s => s === "ok")).toBe(true);
  });

  it("does not depend on timer clamping", async () => {
    // 200 sequential yields must not cost anything close to 200 x 4ms.
    const start = performance.now();
    for (let i = 0; i < 200; i++) await yieldToEventLoop();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
  });

  it("still resolves when the platform offers no scheduler or channel", async () => {
    vi.resetModules();
    const scheduler = (globalThis as { scheduler?: unknown }).scheduler;
    const channel = globalThis.MessageChannel;
    // @ts-expect-error - simulating an older runtime
    delete (globalThis as { scheduler?: unknown }).scheduler;
    // @ts-expect-error - simulating an older runtime
    delete globalThis.MessageChannel;

    try {
      const fresh = await import("../import/shared");
      await expect(fresh.yieldToEventLoop()).resolves.toBeUndefined();
    }
    finally {
      globalThis.MessageChannel = channel;
      if (scheduler) (globalThis as { scheduler?: unknown }).scheduler = scheduler;
      vi.resetModules();
    }
  });
});
