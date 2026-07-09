import { ImportControl } from "../types";

/** Waits while the import is paused, then reports whether it was cancelled. */
export async function isCancelled(control?: ImportControl): Promise<boolean> {
  await control?.waitIfPaused?.();
  return control?.isCancelled?.() ?? false;
}
