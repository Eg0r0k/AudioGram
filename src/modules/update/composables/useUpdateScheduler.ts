import { onUnmounted, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useUpdateStore } from "../store/update.store";
import { getLogger } from "@/lib/logger";

const STARTUP_DELAY_MS = 5000;
const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000;

export interface UpdateSchedulerOptions {
  /**
   * Master switch for automatic update checks. When false, neither the
   * startup check nor the periodic interval is scheduled — the app never
   * checks for updates on its own. `checkNow()` still works for manual checks.
   *
   * Reactive: toggling the setting starts or stops the timers immediately,
   * without waiting for a restart.
   */
  enabled?: MaybeRefOrGetter<boolean>;
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

  const stop = () => {
    clearTimeout(startupTimer);
    clearInterval(intervalTimer);
    startupTimer = undefined;
    intervalTimer = undefined;
  };

  const runCheck = () => {
    store.check().catch((error: unknown) => getLogger().error(`[Update] Scheduled check failed: ${String(error)}`));
  };

  const start = () => {
    stop();
    startupTimer = setTimeout(runCheck, STARTUP_DELAY_MS);
    intervalTimer = setInterval(runCheck, intervalMs);
  };

  watch(
    () => toValue(enabled),
    isEnabled => (isEnabled ? start() : stop()),
    { immediate: true },
  );

  onUnmounted(stop);

  return {
    checkNow: () => store.check(),
  };
};
