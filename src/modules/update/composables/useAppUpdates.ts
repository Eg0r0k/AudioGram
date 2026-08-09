import { watch } from "vue";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { getLogger } from "@/lib/logger";
import { useGeneralSettings } from "@/modules/settings/store/general";
import { useUpdateStore } from "../store/update.store";
import { useUpdateScheduler } from "./useUpdateScheduler";
import { usePwaUpdate } from "./usePwaUpdate";

/**
 * Wires the active update mechanism once, at app root.
 *
 * There is no UI here: an available update is surfaced by the persistent
 * update button in the library sidebar, which reads the same store. A toast
 * was the wrong shape for it — it disappears, while an update stays pending
 * until the user acts on it.
 */
export const useAppUpdates = () => {
  const updateStore = useUpdateStore();
  const { checkUpdatesOnLaunch } = useGeneralSettings();

  if (IS_TAURI) {
    useUpdateScheduler({ enabled: checkUpdatesOnLaunch });
    return;
  }

  const { applyPwaUpdate, checkPwaUpdate } = usePwaUpdate(
    () => updateStore.channel,
    checkUpdatesOnLaunch,
  );

  updateStore.registerPwaHandlers({
    check: checkPwaUpdate,
    apply: applyPwaUpdate,
  });

  getLogger().info("Running in PWA mode, using PWA update mechanism");

  // A disabled auto-check must not leave a stale "available" banner behind.
  watch(checkUpdatesOnLaunch, (enabled) => {
    if (!enabled && updateStore.status === "available") {
      updateStore.dismiss();
    }
  });
};
