import { IS_TAURI } from "@/helpers/environment/userAgent";
import { Event } from "@tauri-apps/api/event";
import type { DragDropEvent } from "@tauri-apps/api/webviewWindow";
import { tryOnScopeDispose } from "@vueuse/core";

export type DragDropPayload = Event<DragDropEvent>["payload"];

export type DragDropCallback = (event: DragDropPayload) => void;

export function useTauriDragDrop(callback: DragDropCallback) {
  if (!IS_TAURI) {
    return () => {};
  }

  let unlisten: (() => void) | undefined;

  const setup = async () => {
    try {
      const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const appWindow = getCurrentWebviewWindow();
      unlisten = await appWindow.onDragDropEvent((event) => {
        callback(event.payload);
      });
    }
    catch (error) {
      console.error("[useTauriDragDrop] Failed to setup drag-drop listener:", error);
    }
  };

  setup();

  const cleanup = () => {
    if (unlisten) {
      unlisten();
      unlisten = undefined;
    }
  };

  tryOnScopeDispose(cleanup);
  return cleanup;
}
