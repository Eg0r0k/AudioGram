import type { ImportControl } from "../types";

/** Waits while the import is paused, then reports whether it was cancelled. */
export async function isCancelled(control?: ImportControl): Promise<boolean> {
  await control?.waitIfPaused?.();
  return control?.isCancelled?.() ?? false;
}

type Scheduler = { yield?: () => Promise<void> };

const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;
const channel = typeof MessageChannel === "function" ? new MessageChannel() : null;
const waiting: Array<() => void> = [];

if (channel) {
  // One posted message wakes exactly one waiter, in submission order.
  channel.port1.onmessage = () => waiting.shift()?.();
}

/**
 * Hands the event loop back so pending UI work (progress, input) can run.
 *
 * `setTimeout(0)` is deliberately avoided: browsers clamp nested timers to 4ms
 * and throttle them to once per second in a background tab, which on a large
 * import turns into minutes of pure waiting between database batches.
 */
export function yieldToEventLoop(): Promise<void> {
  if (scheduler?.yield) return scheduler.yield();

  if (channel) {
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
      channel.port2.postMessage(null);
    });
  }

  return new Promise<void>(resolve => setTimeout(resolve, 0));
}
