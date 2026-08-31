import { IS_TAURI } from "@/lib/environment/userAgent";
import { usePlayerStore } from "@/modules/player";
import { useQueueStore } from "@/modules/queue/store/queue.store";
import { tryOnScopeDispose } from "@vueuse/core";

const guarded = (label: string, action: () => Promise<unknown>) => () => {
  action().catch((err: unknown) => console.warn(`[TauriShortcuts] ${label} failed:`, err));
};

export const useTauriGlobalShortcuts = () => {
  if (!IS_TAURI) return;

  let cleanup: (() => Promise<void>) | null = null;

  const registerShortcuts = async () => {
    const { register, unregisterAll } = await import(
      "@tauri-apps/plugin-global-shortcut",
    );

    await unregisterAll();

    const player = usePlayerStore();
    const queue = useQueueStore();

    const shortcuts: Array<{ key: string; handler: () => void }> = [
      {
        key: "MediaPlayPause",
        handler: guarded("togglePlay", () => player.togglePlay()),
      },
      {
        key: "MediaStop",
        handler: () => player.stop(),
      },
      {
        key: "MediaTrackNext",
        handler: guarded("next", () => queue.next()),
      },
      {
        key: "MediaTrackPrevious",
        handler: guarded("previous", () => queue.previous()),
      },
    ];

    for (const { key, handler } of shortcuts) {
      try {
        await register(key, (event) => {
          if (event.state === "Released") return;
          handler();
        });
      }
      catch (err) {
        console.warn(`[TauriShortcuts] Failed to register "${key}":`, err);
      }
    }

    cleanup = async () => {
      try {
        await unregisterAll();
      }
      catch (err) {
        console.warn("[TauriShortcuts] Failed to unregister:", err);
      }
    };
  };

  registerShortcuts().catch((err) => {
    console.warn("[TauriShortcuts] Plugin not available:", err);
  });

  // cleanup logs its own failures, so a rejection here has nothing to add.
  tryOnScopeDispose(() => {
    cleanup?.().catch(() => {});
  });
};
