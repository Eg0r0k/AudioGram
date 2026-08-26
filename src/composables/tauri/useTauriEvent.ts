import { IS_TAURI } from "@/lib/environment/userAgent";
import type { Event } from "@tauri-apps/api/event";
import { tryOnScopeDispose } from "@vueuse/core";
import { getLogger } from "@/lib/logger";

/**
 * Composable for subscribing to Tauri events with automatic cleanup.
 * @description
 *
 *
 * Subscribes to a specified Tauri event and automatically unsubscribes
 * when the Vue effect scope is disposed (e.g., when component unmounts).
 * Safely returns a no-op function in non-Tauri environments.
 * @template T - Event payload type
 *
 * @param {string} name - Tauri event name to subscribe to
 * @param {(event: Event<T>) => void} callback - Event handler function
 * @returns {VoidFunction} Cleanup function to manually unsubscribe from the event.
 *
 * @example
 * // Basic usage
 * useTauriEvent<string>("greet", (event) => {
 *   console.log("Payload:", event.payload);
 * });
 *
 * @example
 * // With typed payload
 * interface FileDropPayload {
 *   paths: string[];
 *   position: { x: number; y: number };
 * }
 *
 * useTauriEvent<FileDropPayload>("file-drop", (event) => {
 *   console.log("Files:", event.payload.paths);
 * });
 *
 * @example
 * // Manual cleanup
 * const stop = useTauriEvent<number>("progress", (event) => {
 *   if (event.payload >= 100) {
 *     stop();
 *   }
 * });
 *
 * @remarks
 * - Subscription is asynchronous — events emitted before setup completes will be missed
 * - In non-Tauri environments (web), the hook does nothing
 * - Subscription errors are logged to console and not rethrown
 *
 */

export default function useTauriEvent<T>(
  name: string,
  callback: (event: Event<T>) => void,
) {
  if (!IS_TAURI) {
    return () => {};
  }

  let removeListener: VoidFunction | undefined;

  const setup = async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      removeListener = await listen<T>(name, callback);
    }
    catch (error) {
      getLogger().error(`[useTauriEvent] Failed to listen to "${name}": ${String(error)}`);
    }
  };

  setup();

  const cleanup = () => {
    if (removeListener) {
      removeListener();
      removeListener = undefined;
    }
  };

  tryOnScopeDispose(cleanup);

  return cleanup;
}
