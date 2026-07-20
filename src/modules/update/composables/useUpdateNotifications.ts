import { watch } from "vue";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { IS_TAURI } from "@/lib/environment/userAgent";
import { getLogger } from "@/lib/logger";
import { useGeneralSettings } from "@/modules/settings/store/general";
import { useUpdateStore } from "../store/update.store";
import { useUpdateScheduler } from "./useUpdateScheduler";
import { usePwaUpdate } from "./usePwaUpdate";

export const useUpdateNotifications = () => {
  const { t } = useI18n();
  const updateStore = useUpdateStore();
  const { checkUpdatesOnLaunch } = useGeneralSettings();

  let applyPwaUpdate: (() => Promise<void>) | undefined;
  if (IS_TAURI) {
    useUpdateScheduler({ enabled: checkUpdatesOnLaunch.value });
  }
  else {
    ({ applyPwaUpdate } = usePwaUpdate(updateStore.channel, checkUpdatesOnLaunch.value));
    getLogger().info("Running in PWA mode, using PWA update mechanism");
  }

  let toastId: string | number | undefined;
  const dismissToast = () => {
    if (toastId) toast.dismiss(toastId);
  };

  watch(
    () => updateStore.status,
    (status, prevStatus) => {
      switch (status) {
        case "available":
          if (prevStatus === "available") break;
          toastId = toast(
            t("update.updateToVersion", { version: updateStore.updateInfo?.version }),
            {
              action: {
                label: t("update.installUpdate"),
                onClick: () => (IS_TAURI ? updateStore.install() : applyPwaUpdate?.()),
              },
              cancel: { label: t("update.dismiss"), onClick: () => updateStore.dismiss() },
            },
          );
          break;
        case "downloading":
          dismissToast();
          toastId = toast(t("update.downloading"), { duration: Infinity });
          break;
        case "installing":
          dismissToast();
          toastId = toast(t("update.installing"), { duration: Infinity });
          break;
        case "up-to-date":
          dismissToast();
          break;
        case "error":
          dismissToast();
          toastId = toast.error(
            t("update.updateError", { message: updateStore.error?.message ?? "" }),
          );
          break;
      }
    },
  );
};
