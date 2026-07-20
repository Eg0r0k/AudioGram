import { onMounted, onUnmounted } from "vue";
import { useUpdateStore } from "../store/update.store";

const STARTUP_DELAY_MS = 5000;
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface UpdateSchedulerOptions {
  /**
   * Master switch for automatic update checks. When false, neither the
   * startup check nor the periodic interval is scheduled — the app never
   * checks for updates on its own. `checkNow()` still works for manual checks.
   */
  enabled?: boolean;
  intervalMs?: number;
}

export const useUpdateScheduler = (options: UpdateSchedulerOptions = {}) => {
  const {
    enabled = true,
    intervalMs = DEFAULT_INTERVAL_MS,
  } = options;

  const store = useUpdateStore();

  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  let intervalTimer: ReturnType<typeof setInterval> | undefined;

  const scheduleCheck = () => {
    store.check();
  };

  onMounted(() => {
    if (!enabled) return;

    startupTimer = setTimeout(scheduleCheck, STARTUP_DELAY_MS);
    intervalTimer = setInterval(scheduleCheck, intervalMs);
  });

  onUnmounted(() => {
    clearTimeout(startupTimer);
    clearInterval(intervalTimer);
  });

  return {
    checkNow: () => store.check(),
  };
};
