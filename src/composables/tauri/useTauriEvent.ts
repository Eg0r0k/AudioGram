import { IS_TAURI } from "@/helpers/environment/userAgent";
import type { Event } from "@tauri-apps/api/event";
import { tryOnScopeDispose } from "@vueuse/core";

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
      console.error(`[useTauriEvent] Failed to listen to "${name}":`, error);
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
