import { IS_TAURI } from "@/lib/environment/userAgent";
import type { Event } from "@tauri-apps/api/event";
import type { DragDropEvent } from "@tauri-apps/api/webviewWindow";
import { tryOnScopeDispose } from "@vueuse/core";
import { getLogger } from "@/lib/logger";

export type DragDropPayload = Event<DragDropEvent>["payload"];

export type DragDropCallback = (event: DragDropPayload) => void;

export function useTauriDragDrop(callback: DragDropCallback) {
  if (!IS_TAURI) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;
  let isDisposed = false;

  const setup = async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      const stop = await appWindow.onDragDropEvent((event) => {
        callback(event.payload);
      });
      // The scope may have died while the subscription was in flight —
      // cleanup() found nothing to unsubscribe, so it falls to the listener
      // to drop itself the moment it exists.
      if (isDisposed) {
        stop();
        return;
      }
      unlisten = stop;
    }
    catch (error) {
      getLogger().error(`[useTauriDragDrop] Failed to setup drag-drop listener: ${String(error)}`);
    }
  };

  // setup() already logs every failure it can observe, so a rejection here could
  // only come from the logging path itself — there is nothing left to report it to.
  setup().catch(() => {});

  const cleanup = () => {
    isDisposed = true;
    if (unlisten) {
      unlisten();
      unlisten = undefined;
    }
  };

  tryOnScopeDispose(cleanup);
  return cleanup;
}
