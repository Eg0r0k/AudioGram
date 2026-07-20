import { onMounted, onUnmounted, watch } from "vue";
import { useGeneralSettings } from "@/modules/settings/store/general";
import { useAnalysisQueue } from "./useAnalysisQueue";

const STARTUP_DELAY_MS = 3000;

export const useAnalysisQueueLifecycle = () => {
  const { analyzeTracks } = useGeneralSettings();
  const { start, stop } = useAnalysisQueue();

  let startupTimer: ReturnType<typeof setTimeout> | undefined;

  onMounted(() => {
    if (analyzeTracks.value) {
      startupTimer = setTimeout(start, STARTUP_DELAY_MS);
    }
  });

  watch(analyzeTracks, (enabled) => {
    if (enabled) start();
    else stop();
  });

  onUnmounted(() => {
    clearTimeout(startupTimer);
  });
};
